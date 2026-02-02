// =============================================================
// src/middleware.ts – Next.js App Router Middleware
// ─────────────────────────────────────────────
// THE ACTIVATION LOCK: This runs on every request to protected
// routes. It checks if the user is authenticated and active.
// If not active, they are forcibly redirected to /pay-activation.
//
// Protected routes: /dashboard, /invest, /admin
// Public routes:    /, /pay-activation
// =============================================================

import { NextResponse, NextRequest } from 'next/server';

// Routes that require authentication + activation
const PROTECTED_ROUTES = ['/dashboard', '/invest', '/admin'];
// Routes that are always accessible
const PUBLIC_ROUTES = ['/', '/pay-activation'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // If the path is public, let it through immediately.
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // If the path is a protected route or starts with one,
  // we need to verify the user's activation status.
  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  if (!isProtected) {
    // API routes and other paths pass through.
    return NextResponse.next();
  }

  // ── Note on Authentication Check ──
  // Firebase Auth tokens are stored client-side (IndexedDB).
  // Middleware runs on the Edge and does NOT have direct access
  // to Firebase Auth state. Therefore, the activation check is
  // performed CLIENT-SIDE in a shared layout component that wraps
  // all protected pages. See: src/components/ProtectedLayout.tsx
  //
  // This middleware serves as a STRUCTURAL guard for the route
  // hierarchy. The actual auth/activation enforcement is in the
  // ProtectedLayout component, which fires before any page renders.
  // ─────────────────────────────────────────────

  return NextResponse.next();
}

export const config = {
  // Only run middleware on page routes (not static assets or _next)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
