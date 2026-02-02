'use client';
// =============================================================
// src/app/pay-activation/page.tsx – The Activation Payment Gate
// ─────────────────────────────────────────────
// All new (inactive) users land here. They CANNOT access any
// other page until this 20,000 UGX fee is paid and confirmed
// by the webhook.
// =============================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/lib/AuthContext';
import { db, storage } from '@/lib/firebase.client';
import { initiateFlutterwavePayment } from '@/lib/payments';

export default function PayActivationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [method, setMethod] = useState<'online' | 'manual'>('online');
  const [paymentState, setPaymentState] = useState<
    'idle' | 'paying' | 'pending' | 'active'
  >('idle');
  const [error, setError] = useState('');
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const REG_FEE = 20000;

  // Listen for real-time changes to is_active — if webhook fires
  // and activates the user while they're on this page, we auto-redirect.
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.is_active === true) {
          setPaymentState('active');
          setAlreadyActive(true);
          // Auto-redirect after a short delay
          setTimeout(() => router.push('/dashboard'), 2000);
        }
      }
    });

    return () => unsubscribe();
  }, [user, router]);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handlePay = async () => {
    if (!user) return;
    setError('');
    setPaymentState('paying');

    try {
      await initiateFlutterwavePayment({
        amount: REG_FEE,
        email: user.email || 'user@collective.ug',
        phone: user.phoneNumber || '',
        userId: user.uid,
        paymentType: 'reg_fee',
      });

      // If we reach here, the modal closed successfully.
      // The webhook may or may not have fired yet — show pending state.
      setPaymentState('pending');
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
      setPaymentState('idle');
    }
  };

  const handleManualSubmit = async () => {
    if (!user || !screenshot) return;
    setError('');
    setUploading(true);

    try {
      // 1. Upload screenshot
      const fileRef = ref(storage, `screenshots/${user.uid}/${Date.now()}_${screenshot.name}`);
      await uploadBytes(fileRef, screenshot);
      const downloadURL = await getDownloadURL(fileRef);

      // 2. Create verification request
      await addDoc(collection(db, 'verification_requests'), {
        uid: user.uid,
        email: user.email,
        phone: user.phoneNumber,
        screenshot_url: downloadURL,
        amount: REG_FEE,
        status: 'pending',
        type: 'reg_fee',
        createdAt: serverTimestamp(),
      });

      setPaymentState('pending');
    } catch (err: any) {
      setError(err.message || 'Failed to submit request.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4">
      {/* Decorative */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 opacity-5 pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--color-accent), transparent 70%)' }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Lock Icon */}
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{ background: paymentState === 'active' ? 'var(--color-success-dim)' : 'var(--color-accent-glow)' }}
          >
            <span className="text-4xl">{paymentState === 'active' ? '✅' : '🔐'}</span>
          </div>
          <h1 className="font-display font-800 text-2xl text-on-surface">
            {paymentState === 'active' ? 'You\'re Active!' : 'Activate Your Account'}
          </h1>
          <p className="text-on-surface-dim text-sm mt-1">
            {paymentState === 'active'
              ? 'Redirecting to your dashboard...'
              : 'Complete your one-time registration fee to unlock all features.'}
          </p>
        </div>

        {/* Method Toggle */}
        {paymentState !== 'active' && paymentState !== 'pending' && (
          <div className="flex bg-surface-hover rounded-xl p-1 mb-6">
            <button
              onClick={() => setMethod('online')}
              className={`flex-1 py-2 rounded-lg text-sm font-body font-600 transition-all ${
                method === 'online' ? 'bg-surface-raised text-accent shadow-sm' : 'text-on-surface-dim'
              }`}
            >
              💳 Online Pay
            </button>
            <button
              onClick={() => setMethod('manual')}
              className={`flex-1 py-2 rounded-lg text-sm font-body font-600 transition-all ${
                method === 'manual' ? 'bg-surface-raised text-accent shadow-sm' : 'text-on-surface-dim'
              }`}
            >
              📲 Manual MoMo
            </button>
          </div>
        )}

        {/* Fee Card */}
        {paymentState !== 'active' && (
          <div className="card space-y-5">
            {/* Fee Breakdown */}
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-on-surface-dim text-sm">Registration Fee</span>
                <span className="text-on-surface font-600">20,000 UGX</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-on-surface-dim text-sm">Processing Fee</span>
                <span className="text-success text-sm font-600">Free</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-on-surface font-600">Total Due</span>
                <span className="text-accent font-display font-800 text-xl">20,000 UGX</span>
              </div>
            </div>

            {method === 'online' ? (
              <>
                {/* What you unlock */}
                <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--color-surface-hover)' }}>
                  <p className="text-xs font-600 text-on-surface-dim uppercase tracking-wide">You unlock:</p>
                  {['Browse & invest in projects', 'Earn monthly dividends', 'Earn 4,000 UGX per referral', 'View your investor dashboard'].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-success text-sm">✓</span>
                      <span className="text-on-surface text-sm">{item}</span>
                    </div>
                  ))}
                </div>

                {/* Payment Methods Info */}
                <p className="text-xs text-on-surface-dim text-center">
                  Pay via <span className="text-on-surface">MTN MoMo</span>, <span className="text-on-surface">Airtel Money</span>, or <span className="text-on-surface">Card</span>
                </p>

                {/* Action Button */}
                {paymentState === 'idle' && (
                  <button className="btn btn-primary w-full animate-pulse-glow" onClick={handlePay}>
                    💳 Pay 20,000 UGX — Activate Now
                  </button>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--color-surface-hover)' }}>
                  <p className="text-xs font-600 text-on-surface-dim uppercase tracking-wide">Send 20,000 UGX to:</p>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-700 text-on-surface">0779710365</p>
                      <p className="text-xs text-on-surface-dim">MTN - Wafuka Kevin</p>
                    </div>
                    <span className="text-xs bg-yellow-500/10 text-yellow-600 px-2 py-1 rounded font-600">MTN</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-3">
                    <div>
                      <p className="text-sm font-700 text-on-surface">0702377999</p>
                      <p className="text-xs text-on-surface-dim">Airtel - Aisha Nangobi</p>
                    </div>
                    <span className="text-xs bg-red-500/10 text-red-600 px-2 py-1 rounded font-600">Airtel</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-600 text-on-surface-dim uppercase tracking-wide">
                    Upload Payment Screenshot
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
                    className="w-full text-sm text-on-surface-dim file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-600 file:bg-accent file:text-white hover:file:bg-accent/90 cursor-pointer"
                  />
                </div>

                {paymentState === 'idle' && (
                  <button
                    className="btn btn-primary w-full"
                    onClick={handleManualSubmit}
                    disabled={!screenshot || uploading}
                  >
                    {uploading ? 'Uploading...' : 'Submit Verification Request'}
                  </button>
                )}
              </div>
            )}

            {paymentState === 'paying' && (
              <div className="flex items-center justify-center gap-3 py-3">
                <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                <span className="text-on-surface-dim text-sm">Opening payment...</span>
              </div>
            )}

            {paymentState === 'pending' && (
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  <span className="text-on-surface text-sm font-600">Waiting for payment confirmation...</span>
                </div>
                <p className="text-on-surface-dim text-xs">
                  If you completed your MoMo PIN, please wait a moment. This page will update automatically.
                </p>
                <button
                  className="btn btn-ghost w-full text-sm"
                  onClick={() => setPaymentState('idle')}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-lg text-sm text-error text-center" style={{ background: 'var(--color-error-dim)' }}>
            {error}
          </div>
        )}

        {/* Back link */}
        <p className="text-center mt-6">
          <a href="/" className="text-on-surface-dim text-xs hover:text-accent transition-colors">
            ← Back to login
          </a>
        </p>
      </div>
    </div>
  );
}
