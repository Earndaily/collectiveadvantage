'use client';
// =============================================================
// src/app/page.tsx – Landing & Authentication Page
// The entry point. New users sign up (with optional referral code).
// Existing users log in. After auth, the middleware checks
// is_active and routes accordingly.
// =============================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase.client';
import { useAuth } from '@/lib/AuthContext';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const [isSignUp, setIsSignUp] = useState(true);

  // Email auth fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Shared
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Read referral code from URL on mount (e.g., /ref/abc123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setReferralCode(ref);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // ── Email Auth ──
  const handleEmailAuth = async () => {
    setError('');
    setIsLoading(true);

    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }

      if (isSignUp) {
        const user = userCredential.user;
        
        // IMMEDIATELY create the document in Firestore
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          phone: user.phoneNumber || null,
          is_active: true,
          referral_code: referralCode || null,
          wallet_balance: 0,
          createdAt: serverTimestamp()
        });

        const token = await user.getIdToken();
        // Optional: still call the API if you need server-side referral logic 
        // or just rely on the client-side creation above.
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ phone: null, referrer_code: referralCode || null }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Server registration failed.');
        }
      }

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Google Auth ──
  const handleGoogleSignIn = async () => {
    setError('');
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Check if user already exists or create new one
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        phone: user.phoneNumber || null,
        is_active: false, // Default to inactive until payment
        referral_code: referralCode || null,
        wallet_balance: 0,
        createdAt: serverTimestamp()
      }, { merge: true });

      const token = await user.getIdToken();
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: user.phoneNumber || null, referrer_code: referralCode || null }),
      });

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* ─── Decorative Background ─── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, var(--color-accent), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, var(--color-success), transparent 70%)' }}
        />
      </div>

      {/* ─── Header ─── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <polygon points="16,2 30,12 24,30 8,30 2,12" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
            <polygon points="16,8 24,13 20,24 12,24 8,13" fill="var(--color-accent)" opacity="0.3" />
          </svg>
          <span className="font-display font-700 text-lg text-on-surface">Collective</span>
          <span className="font-display font-800 text-lg text-accent">Advantage</span>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          {/* ─── LANDING VIEW ─── */}
          {view === 'landing' && (
            <div className="animate-fadeInUp text-center">
              <h1 className="font-display font-800 text-4xl text-on-surface mb-4 leading-tight">
                Pool.<span className="text-accent"> Invest.</span><br />Grow Together.
              </h1>
              <p className="text-on-surface-dim text-base leading-relaxed mb-8 max-w-sm mx-auto">
                Join a community financing real projects — rentals, schools, businesses — and share in the returns.
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => { setView('auth'); setIsSignUp(true); }}
                  className="btn btn-primary w-full py-4 text-lg"
                >
                  Get Started
                </button>
                <button 
                  onClick={() => { setView('auth'); setIsSignUp(false); }}
                  className="btn btn-ghost w-full"
                >
                  Sign In to Your Account
                </button>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl mb-1">🛡️</p>
                  <p className="text-[10px] uppercase font-700 tracking-wider text-on-surface-dim">Secure</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl mb-1">💎</p>
                  <p className="text-[10px] uppercase font-700 tracking-wider text-on-surface-dim">Profitable</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl mb-1">🌍</p>
                  <p className="text-[10px] uppercase font-700 tracking-wider text-on-surface-dim">Community</p>
                </div>
              </div>
            </div>
          )}

          {/* ─── AUTH VIEW ─── */}
          {view === 'auth' && (
            <div className="animate-fadeIn">
              <button 
                onClick={() => setView('landing')}
                className="mb-6 text-on-surface-dim hover:text-accent flex items-center gap-2 text-sm font-600 transition-colors"
              >
                ← Back
              </button>

              <div className="text-center mb-6">
                <h2 className="font-display font-800 text-2xl text-on-surface">
                  {isSignUp ? 'Create Account' : 'Welcome Back'}
                </h2>
                <p className="text-on-surface-dim text-sm mt-1">
                  {isSignUp ? 'Start your journey today' : 'Continue growing your portfolio'}
                </p>
              </div>

              {/* Email Form */}
              <div className="card space-y-4 shadow-xl">
                <div className="flex justify-center gap-4 text-xs font-700 uppercase tracking-widest">
                  <button
                    onClick={() => setIsSignUp(true)}
                    className={`pb-1 border-b-2 transition-colors ${
                      isSignUp ? 'border-accent text-accent' : 'border-transparent text-on-surface-dim'
                    }`}
                  >
                    Sign Up
                  </button>
                  <button
                    onClick={() => setIsSignUp(false)}
                    className={`pb-1 border-b-2 transition-colors ${
                      !isSignUp ? 'border-accent text-accent' : 'border-transparent text-on-surface-dim'
                    }`}
                  >
                    Log In
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-700 text-on-surface-dim mb-1 uppercase tracking-wider">
                      Email Address
                    </label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="you@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-700 text-on-surface-dim mb-1 uppercase tracking-wider">
                      Password
                    </label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {isSignUp && (
                    <div>
                      <label className="block text-[10px] font-700 text-on-surface-dim mb-1 uppercase tracking-wider">
                        Referral Code <span className="opacity-50">(optional)</span>
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Friend's referral code"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-primary w-full py-3"
                  onClick={handleEmailAuth}
                  disabled={isLoading || !email || !password}
                >
                  {isLoading ? 'Processing...' : isSignUp ? 'Create Account' : 'Log In'}
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" style={{ borderColor: 'var(--color-border)' }}></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-700 tracking-tighter">
                    <span className="bg-surface px-2 text-on-surface-dim">Or continue with</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="btn btn-ghost w-full flex items-center justify-center gap-3 border shadow-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Google
                </button>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mt-4 p-3 rounded-lg text-xs text-error text-center" style={{ background: 'var(--color-error-dim)' }}>
                  {error}
                </div>
              )}

              <p className="text-center text-[10px] text-on-surface-dim mt-8 leading-relaxed max-w-[280px] mx-auto">
                By joining, you agree that a one-time activation fee of{' '}
                <span className="text-accent font-700">20,000 UGX</span> applies.
              </p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
