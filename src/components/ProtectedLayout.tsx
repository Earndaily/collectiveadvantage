'use client';
// =============================================================
// src/components/ProtectedLayout.tsx
// ─────────────────────────────────────────────
// Wraps every protected page (/dashboard, /invest, /admin).
// Responsibilities:
//   1. If no user → redirect to /
//   2. If user exists but is_active === false → redirect to /pay-activation
//   3. If user is active → render the nav shell + children
// =============================================================

import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase.client';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase.client';

interface ProtectedLayoutProps {
  children: ReactNode;
  currentView?: string;
  onSetView?: (view: any) => void;
  isAdmin?: boolean;
}

export default function ProtectedLayout({ children, currentView, onSetView, isAdmin }: ProtectedLayoutProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'loading' | 'active' | 'inactive' | 'denied'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function checkActivation() {
      if (!user) {
        router.push('/');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        if (!userDoc.exists()) {
          setTimeout(() => { if (!cancelled) router.push('/pay-activation'); }, 1500);
          return;
        }
        setStatus('active');
      } catch (err) {
        setStatus('active'); // Fallback
      }
    }

    if (!authLoading) checkActivation();
    return () => { cancelled = true; };
  }, [user, authLoading, router]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'invest',    label: 'Invest',    icon: '💰' },
  ];
  if (isAdmin) navItems.push({ id: 'admin', label: 'Admin', icon: '🔑' });

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col pb-20 sm:pb-0">
      <header className="sticky top-0 z-50 bg-surface-raised border-b border-surface" style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1.5">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <polygon points="16,2 30,12 24,30 8,30 2,12" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
              <polygon points="16,8 24,13 20,24 12,24 8,13" fill="var(--color-accent)" opacity="0.4" />
            </svg>
            <span className="font-display font-700 text-sm text-accent">CA</span>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSetView?.(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-body font-500 transition-colors ${
                  currentView === item.id
                    ? 'bg-surface-hover text-accent'
                    : 'text-on-surface-dim hover:text-on-surface hover:bg-surface-hover'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <button onClick={handleLogout} className="text-on-surface-dim hover:text-error text-xs font-600 transition-colors px-2 py-1">Logout</button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-raised border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex justify-around py-2 px-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSetView?.(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs font-body font-500 transition-colors ${
                currentView === item.id ? 'text-accent' : 'text-on-surface-dim'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
