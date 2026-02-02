// =============================================================
// src/app/api/projects/route.ts
// ─────────────────────────────────────────────
// Admin-only API for managing projects.
// GET  → Public list of all projects (for marketplace).
// POST → Create a new project (admin only).
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase.admin';
import admin from 'firebase-admin';

// ─── GET: Fetch all projects (public, authenticated users only) ───
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  try {
    await adminAuth.verifyIdToken(authHeader.split(' ')[1]);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const snapshot = await adminDb.collection('projects').orderBy('created_at', 'desc').get();
  const projects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return NextResponse.json({ projects });
}


// ─── POST: Create a new project (admin only) ───
export async function POST(req: NextRequest) {
  // ── Verify admin claim ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(authHeader.split(' ')[1]);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // The `admin` custom claim must be set via Admin SDK.
  if (decodedToken.admin !== true) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // ── Parse and validate the new project payload ──
  const { title, description, category, total_goal, slot_price, total_slots, monthly_yield_per_slot, image_url } =
    await req.json();

  // Basic validation
  if (!title || !total_goal || !slot_price || !total_slots || !monthly_yield_per_slot) {
    return NextResponse.json(
      { error: 'Missing required fields: title, total_goal, slot_price, total_slots, monthly_yield_per_slot' },
      { status: 400 }
    );
  }

  if (slot_price * total_slots !== total_goal) {
    return NextResponse.json(
      { error: 'Validation failed: slot_price × total_slots must equal total_goal' },
      { status: 400 }
    );
  }

  // ── Create the project document ──
  const projectRef = await adminDb.collection('projects').add({
    title,
    description: description || '',
    category: category || 'general',     // e.g., 'rental', 'school', 'business'
    total_goal,
    slot_price,
    total_slots,
    filled_slots: 0,
    monthly_yield_per_slot,
    status: 'funding',                   // New projects always start in 'funding'
    image_url: image_url || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.info(`[PROJECT] New project created: ${projectRef.id} by admin ${decodedToken.uid}.`);

  return NextResponse.json({
    success: true,
    project_id: projectRef.id,
    message: `Project '${title}' created successfully.`,
  });
}
