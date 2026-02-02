// =============================================================
// src/lib/payments.ts
// Payment logic layer – abstracts Flutterwave integration.
// Contains: (1) Client-side checkout initiator,
//           (2) Server-side webhook signature verifier.
// =============================================================

// ─────────────────────────────────────────────
// 1. CLIENT-SIDE: Initiate Flutterwave Inline Checkout
// ─────────────────────────────────────────────
// This function dynamically loads the Flutterwave Inline script
// and opens the payment modal for the user.
// ─────────────────────────────────────────────
interface PaymentPayload {
  amount: number;       // Amount in UGX
  email: string;        // User's email
  phone: string;        // User's phone (for MoMo)
  userId: string;      // Firebase UID – passed as metadata
  paymentType: 'reg_fee' | 'investment';
  projectId?: string;   // Required if type is 'investment'
}

export async function initiateFlutterwavePayment(payload: PaymentPayload) {
  // Dynamically load the Flutterwave script if not already present.
  if (!(window as any).FlutterwaveCheckout) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.flutterwave.com/v3.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Flutterwave script'));
      document.head.appendChild(script);
    });
  }

  return new Promise<void>((resolve, reject) => {
    // Flutterwave Inline configuration object.
    const config = {
      public_key: process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY!,
      tx_ref: `ca_${payload.userId}_${Date.now()}`, // Unique transaction reference
      amount: payload.amount,
      currency: 'UGX',
      payment_method: 'mobmoney,card',  // MoMo + Card for Uganda
      customer: {
        email: payload.email,
        phone_number: payload.phone,
        name: `User_${payload.userId}`,
      },
      customizations: {
        title: payload.paymentType === 'reg_fee'
          ? 'Collective Advantage – Activation'
          : 'Collective Advantage – Slot Investment',
        description:
          payload.paymentType === 'reg_fee'
            ? 'One-time registration & activation fee'
            : `Investment in project ${payload.projectId}`,
        image_url: '/logo.png',
      },
      // Metadata passed through to the webhook – how we know WHAT was paid for.
      meta: {
        user_uid: payload.userId,
        payment_type: payload.paymentType,
        project_id: payload.projectId || null,
      },
    };

    // Open the Flutterwave payment modal.
    (window as any).FlutterwaveCheckout(config);
    resolve(); // Resolve immediately as FlutterwaveCheckout doesn't return a promise and handles its own callbacks
  });
}


// ─────────────────────────────────────────────
// 2. SERVER-SIDE: Verify Flutterwave Webhook Signature
// ─────────────────────────────────────────────
// Flutterwave signs each webhook POST with an HMAC-SHA256 hash
// of the raw body, using your webhook secret key.
// We MUST verify this before processing any payment event.
// ─────────────────────────────────────────────
import crypto from 'crypto';

export function verifyFlutterwaveWebhook(
  rawBody: string,      // The raw, unparsed request body string
  signatureHeader: string // The value of the 'X-Payment-Signature' header
): boolean {
  const webhookSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET!;

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks.
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signatureHeader)
  );
}
