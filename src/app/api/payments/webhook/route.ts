// =============================================================
// src/app/api/payments/webhook/route.ts
// ─────────────────────────────────────────────
// THE CENTRAL PAYMENT WEBHOOK – Flutterwave POSTs here after
// a user completes their MoMo PIN or card payment.
//
// This route handles TWO payment types:
//   1. reg_fee   → Activate the user + pay referral bonus.
//   2. investment → Credit a slot in a project.
//
// SECURITY: Signature is verified BEFORE any logic runs.
// IDEMPOTENCY: We check if a tx_ref was already processed to
//   prevent duplicate payouts on webhook retries.
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase.admin';
import { verifyFlutterwaveWebhook } from '@/lib/payments';
import admin from 'firebase-admin';

// ─────────────────────────────────────────────
// POST /api/payments/webhook
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── Step 1: Read raw body for signature verification ──
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('X-Payment-Signature') || '';

  // ── Step 2: Verify the webhook signature ──
  if (!verifyFlutterwaveWebhook(rawBody, signatureHeader)) {
    console.warn('[WEBHOOK] Signature verification FAILED. Possible replay attack.');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── Step 3: Parse the verified payload ──
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
  }

  // ── Step 4: Guard – only process "successful" payment events ──
  if (event.status !== 'successful') {
    // Flutterwave sends webhooks for failed/cancelled too. Ignore them.
    return NextResponse.json({ received: true, processed: false }, { status: 200 });
  }

  const { tx_ref, amount, meta } = event.data;
  const { user_uid, payment_type, project_id } = meta;

  // ── Step 5: IDEMPOTENCY CHECK ──
  // Search for an existing transaction with this tx_ref.
  // If found and status is 'completed', this is a duplicate webhook. Skip.
  const existingTx = await adminDb
    .collection('transactions')
    .where('tx_ref', '==', tx_ref)
    .limit(1)
    .get();

  if (!existingTx.empty && existingTx.docs[0].data().status === 'completed') {
    console.info(`[WEBHOOK] Duplicate webhook for tx_ref=${tx_ref}. Skipping.`);
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  // ── Step 6: Route to the correct handler based on payment_type ──
  try {
    if (payment_type === 'reg_fee') {
      await handleRegistrationFee({ user_uid, amount, tx_ref });
    } else if (payment_type === 'investment' && project_id) {
      await handleInvestment({ user_uid, project_id, amount, tx_ref });
    } else {
      console.warn(`[WEBHOOK] Unknown payment_type: ${payment_type}`);
    }
  } catch (err) {
    console.error('[WEBHOOK] Processing error:', err);
    // Return 500 so Flutterwave will RETRY the webhook.
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  // ── Step 7: Acknowledge receipt (200 = Flutterwave won't retry) ──
  return NextResponse.json({ received: true, processed: true }, { status: 200 });
}


// =====================================================================
// HANDLER 1: Registration Fee (The Activation Lock + Referral Trigger)
// =====================================================================
// Logic Flow:
//   1. Record the transaction.
//   2. Set the user's `is_active` to true.
//   3. Read the user's `referrer_uid`.
//   4. If a referrer exists, increment their wallet_balance by 4,000 UGX
//      and record a 'referral_bonus' transaction for the referrer.
// =====================================================================
async function handleRegistrationFee({
  user_uid,
  amount,
  tx_ref,
}: {
  user_uid: string;
  amount: number;
  tx_ref: string;
}) {
  const REG_FEE = parseInt(process.env.REGISTRATION_FEE_UGX || '20000');
  const REFERRAL_BONUS = parseInt(process.env.REFERRAL_BONUS_UGX || '4000');

  // Validate amount matches expected registration fee
  if (amount < REG_FEE) {
    console.error(`[REG_FEE] Amount mismatch: received ${amount}, expected ${REG_FEE}`);
    throw new Error('Amount does not match registration fee');
  }

  // ── 1. Record the registration transaction ──
  await adminDb.collection('transactions').add({
    user_uid,
    type: 'reg_fee',
    amount: REG_FEE,
    tx_ref,
    status: 'completed',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ── 2. Activate the user ──
  const userRef = adminDb.doc(`users/${user_uid}`);
  await userRef.update({
    is_active: true,
  });
  console.info(`[REG_FEE] User ${user_uid} activated.`);

  // ── 3. Read the user's referrer_uid ──
  const userDoc = await userRef.get();
  const userData = userDoc.data();

  if (!userData) {
    console.warn(`[REG_FEE] User document not found for ${user_uid}. Cannot check referrer.`);
    return;
  }

  const referrerUid: string | null = userData.referrer_uid || null;

  // ── 4. Pay the referral bonus (if a valid referrer exists) ──
  if (referrerUid) {
    const referrerRef = adminDb.doc(`users/${referrerUid}`);
    const referrerDoc = await referrerRef.get();

    // Safety: only pay if the referrer document actually exists and is active.
    if (referrerDoc.exists && referrerDoc.data()?.is_active === true) {
      // Atomically increment the referrer's wallet balance.
      await referrerRef.update({
        wallet_balance: admin.firestore.FieldValue.increment(REFERRAL_BONUS),
      });

      // Record the referral bonus as a transaction on the REFERRER's history.
      await adminDb.collection('transactions').add({
        user_uid: referrerUid,         // This tx belongs to the referrer
        type: 'referral_bonus',
        amount: REFERRAL_BONUS,
        referred_user_uid: user_uid,   // Who triggered the bonus
        status: 'completed',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.info(
        `[REFERRAL] Paid ${REFERRAL_BONUS} UGX bonus to referrer ${referrerUid} ` +
        `(triggered by new user ${user_uid}).`
      );
    } else {
      console.warn(
        `[REFERRAL] Referrer ${referrerUid} does not exist or is not active. Bonus skipped.`
      );
    }
  }
}


// =====================================================================
// HANDLER 2: Slot Investment (Project Progress Logic)
// =====================================================================
// Logic Flow:
//   1. Read the project to get slot_price and validate.
//   2. Record the investment transaction.
//   3. Atomically increment project's filled_slots.
//   4. If filled_slots now equals total_slots, set status to 'building'.
// =====================================================================
async function handleInvestment({
  user_uid,
  project_id,
  amount,
  tx_ref,
}: {
  user_uid: string;
  project_id: string;
  amount: number;
  tx_ref: string;
}) {
  const projectRef = adminDb.doc(`projects/${project_id}`);
  const projectDoc = await projectRef.get();

  if (!projectDoc.exists) {
    throw new Error(`Project ${project_id} not found.`);
  }

  const project = projectDoc.data()!;

  // ── Validate the project is still accepting investments ──
  if (project.status !== 'funding') {
    throw new Error(`Project ${project_id} is not in 'funding' status.`);
  }

  // ── Validate amount matches the slot price ──
  // Calculate how many slots this payment covers.
  const slotsBought = Math.floor(amount / project.slot_price);
  if (slotsBought < 1) {
    throw new Error(`Payment amount ${amount} is less than one slot price (${project.slot_price}).`);
  }

  // ── Ensure we don't overfill the project ──
  const slotsRemaining = project.total_slots - project.filled_slots;
  const slotsToCredit = Math.min(slotsBought, slotsRemaining);

  if (slotsToCredit < 1) {
    throw new Error(`Project ${project_id} has no remaining slots.`);
  }

  // ── 1. Record the investment transaction ──
  await adminDb.collection('transactions').add({
    user_uid,
    type: 'investment',
    amount: slotsToCredit * project.slot_price,
    project_id,
    slots_bought: slotsToCredit,
    tx_ref,
    status: 'completed',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ── 2 & 3. Atomically update the project ──
  // We use a Firestore transaction to prevent race conditions
  // when multiple users buy slots simultaneously.
  await adminDb.runTransaction(async (transaction) => {
    const freshProject = await transaction.get(projectRef);
    const freshData = freshProject.data()!;

    const newFilledSlots = freshData.filled_slots + slotsToCredit;

    // Determine new status
    const newStatus =
      newFilledSlots >= freshData.total_slots ? 'building' : 'funding';

    transaction.update(projectRef, {
      filled_slots: newFilledSlots,
      status: newStatus,
    });

    if (newStatus === 'building') {
      console.info(
        `[INVESTMENT] Project ${project_id} fully funded! Status changed to 'building'.`
      );
    }
  });

  console.info(
    `[INVESTMENT] User ${user_uid} bought ${slotsToCredit} slot(s) in project ${project_id}.`
  );
}
