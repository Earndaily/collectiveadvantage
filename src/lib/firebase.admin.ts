// =============================================================
// src/lib/firebase.admin.ts
// Server-side Firebase Admin SDK – used ONLY in API routes.
// Handles privileged operations: writing transactions, setting
// custom claims, updating wallet balances, etc.
// =============================================================

import admin from 'firebase-admin';

// Singleton initialization for the Admin SDK.
// In Next.js serverless functions, modules can be re-imported,
// so we guard against re-initializing.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      // The private key in env vars has escaped newlines; restore them.
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { admin, adminDb, adminAuth };
