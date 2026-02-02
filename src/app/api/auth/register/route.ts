// =============================================================
// src/app/api/auth/register/route.ts
// ─────────────────────────────────────────────
// Called by the signup page AFTER Firebase Auth creates the user.
// This route creates the Firestore `users` document with the
// referrer link and initial state (is_active: false).
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase.admin';
import admin from 'firebase-admin';

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate the request using the user's Firebase ID token ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;

    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (err: any) {
      console.error('[REGISTER] Token verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const uid = decodedToken.uid;

    // ── Parse the request body ──
    const body = await req.json();
    const { phone, referrer_code } = body;

    // ── Resolve referrer_code to a UID ──
    let referrer_uid: string | null = null;

    if (referrer_code) {
      try {
        const referrerDoc = await adminDb.doc(`users/${referrer_code}`).get();
        if (referrerDoc.exists && referrerDoc.data()?.is_active === true) {
          referrer_uid = referrer_code;
        } else {
          console.warn(`[REGISTER] Referrer code '${referrer_code}' is invalid or inactive.`);
        }
      } catch (err: any) {
        console.error('[REGISTER] Referrer lookup failed:', err.message);
      }
    }

    // ── Check if user document already exists (prevent duplicates) ──
    const existingUser = await adminDb.doc(`users/${uid}`).get();
    if (existingUser.exists) {
      return NextResponse.json({ message: 'User already registered' }, { status: 200 });
    }

    // ── Create the user document ──
    await adminDb.doc(`users/${uid}`).set({
      uid,
      phone: phone || null,
      referrer_uid,
      is_active: true,         // Bypassing activation for now
      wallet_balance: 0,
      joined_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.info(`[REGISTER] New user ${uid} created. Referrer: ${referrer_uid || 'none'}.`);

    return NextResponse.json({
      success: true,
      message: 'Registration complete. Proceed to activation payment.',
      referrer_linked: !!referrer_uid,
    });
  } catch (err: any) {
    console.error('[REGISTER] Global error:', err);
    return NextResponse.json(
      { error: 'Internal server error during registration', details: err.message },
      { status: 500 }
    );
  }
}
