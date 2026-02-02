import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase.admin';
import admin from 'firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Admin check: using the 'admin' claim
    if (decodedToken.admin !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
    }

    const requestRef = adminDb.doc(`verification_requests/${requestId}`);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const requestData = requestDoc.data()!;
    if (requestData.status !== 'pending') {
      return NextResponse.json({ error: 'Request already processed' }, { status: 400 });
    }

    const { uid, type, amount } = requestData;

    // Process based on type
    if (type === 'reg_fee') {
      const REFERRAL_BONUS = 4000;

      // 1. Mark as approved
      await requestRef.update({ status: 'approved' });

      // 2. Activate user
      await adminDb.doc(`users/${uid}`).update({ is_active: true });

      // 3. Create transaction for the user
      await adminDb.collection('transactions').add({
        user_uid: uid,
        type: 'reg_fee',
        amount: amount,
        status: 'completed',
        method: 'manual',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 4. Handle referral bonus
      const userDoc = await adminDb.doc(`users/${uid}`).get();
      const userData = userDoc.data();
      const referrerUid = userData?.referrer_uid;

      if (referrerUid) {
        const referrerRef = adminDb.doc(`users/${referrerUid}`);
        const referrerDoc = await referrerRef.get();
        if (referrerDoc.exists && referrerDoc.data()?.is_active === true) {
          await referrerRef.update({
            wallet_balance: admin.firestore.FieldValue.increment(REFERRAL_BONUS),
          });

          await adminDb.collection('transactions').add({
            user_uid: referrerUid,
            type: 'referral_bonus',
            amount: REFERRAL_BONUS,
            referred_user_uid: uid,
            status: 'completed',
            created_at: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    } else if (type === 'investment') {
      const { project_id } = requestData;
      if (!project_id) {
        return NextResponse.json({ error: 'Project ID missing for investment' }, { status: 400 });
      }

      // 1. Mark request as approved
      await requestRef.update({ status: 'approved' });

      // 2. Increment filled slots in the project
      await adminDb.doc(`projects/${project_id}`).update({
        filled_slots: admin.firestore.FieldValue.increment(1),
      });

      // 3. Create investment record
      await adminDb.collection('investments').add({
        user_uid: uid,
        project_id: project_id,
        amount: amount,
        status: 'completed',
        purchase_method: 'manual',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 4. Create transaction record
      await adminDb.collection('transactions').add({
        user_uid: uid,
        type: 'slot_purchase',
        amount: amount,
        status: 'completed',
        project_id: project_id,
        method: 'manual',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
        // Handle other types if necessary
        await requestRef.update({ status: 'approved' });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
