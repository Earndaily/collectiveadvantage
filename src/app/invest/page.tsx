'use client';
// =============================================================
// src/app/invest/page.tsx – Project Marketplace
// ─────────────────────────────────────────────
// Fetches all projects from Firestore (via the API for
// consistency), displays them as cards with key metrics,
// and allows users to purchase slots.
// =============================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { initiateFlutterwavePayment } from '@/lib/payments';
import { db, storage } from '@/lib/firebase.client';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import ProtectedLayout from '@/components/ProtectedLayout';

interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  total_goal: number;
  slot_price: number;
  total_slots: number;
  filled_slots: number;
  monthly_yield_per_slot: number;
  status: 'funding' | 'building' | 'active';
  image_url?: string;
}

export default function InvestPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchaseState, setPurchaseState] = useState<Record<string, 'idle' | 'paying' | 'pending'>>({});
  const [filter, setFilter] = useState<string>('all'); // 'all' | 'funding' | 'building' | 'active'

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'manual' | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ── Fetch projects (shared so we can call from polling) ──
  const fetchProjects = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProjects(data.projects || []);
      return data.projects as Project[] | undefined;
    } catch (err) {
      setError('Failed to load projects.');
      console.error(err);
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchProjects();
  }, [user]);

  // ── Poll for project updates when payment is pending (so funding progress updates as soon as webhook runs) ──
  useEffect(() => {
    const pendingProjectIds = Object.entries(purchaseState)
      .filter(([, s]) => s === 'pending')
      .map(([id]) => id);
    if (pendingProjectIds.length === 0 || !user) return;

    const pollInterval = 2000; // 2s
    const maxPolls = 6;       // poll for up to ~12s
    let count = 0;

    const intervalId = setInterval(async () => {
      count += 1;
      const token = await user.getIdToken();
      const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const next = (data.projects || []) as Project[];
      setProjects(next);

      if (count >= maxPolls) {
        setPurchaseState((prev) => {
          const nextState = { ...prev };
          pendingProjectIds.forEach((id) => { nextState[id] = 'idle'; });
          return nextState;
        });
      }
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [purchaseState, user]);

  // ── Buy a slot ──
  const handleBuySlot = async (project: Project) => {
    setSelectedProject(project);
    setPaymentMethod(null);
    setScreenshot(null);
    setError('');
  };

  const handleOnlinePayment = async () => {
    if (!user || !selectedProject) return;
    
    setPurchaseState((prev) => ({ ...prev, [selectedProject.id]: 'paying' }));
    setError('');
    const projectId = selectedProject.id;
    const amount = selectedProject.slot_price;
    setSelectedProject(null);

    try {
      await initiateFlutterwavePayment({
        amount,
        email: user.email || 'user@collective.ug',
        phone: user.phoneNumber || '',
        userId: user.uid,
        paymentType: 'investment',
        projectId: projectId,
      });

      setPurchaseState((prev) => ({ ...prev, [projectId]: 'pending' }));
    } catch (err: any) {
      setError(err.message || 'Payment failed.');
      setPurchaseState((prev) => ({ ...prev, [projectId]: 'idle' }));
    }
  };

  const handleManualInvestment = async () => {
    if (!user || !selectedProject || !screenshot) return;
    setIsUploading(true);
    setError('');

    try {
      // 1. Upload screenshot
      const fileRef = ref(storage, `investments/${user.uid}/${Date.now()}_${screenshot.name}`);
      await uploadBytes(fileRef, screenshot);
      const downloadURL = await getDownloadURL(fileRef);

      // 2. Create verification request
      await addDoc(collection(db, 'verification_requests'), {
        uid: user.uid,
        email: user.email,
        phone: user.phoneNumber,
        screenshot_url: downloadURL,
        amount: selectedProject.slot_price,
        status: 'pending',
        type: 'investment',
        project_id: selectedProject.id,
        createdAt: serverTimestamp(),
      });

      setPurchaseState((prev) => ({ ...prev, [selectedProject.id!]: 'pending' }));
      setSelectedProject(null);
      setPaymentMethod(null);
      setScreenshot(null);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request.');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Filtered projects ──
  const filteredProjects =
    filter === 'all' ? projects : projects.filter((p) => p.status === filter);

  // ── Helpers ──
  const formatUGX = (n: number) => `${n.toLocaleString()} UGX`;
  const slotsRemaining = (p: Project) => p.total_slots - p.filled_slots;
  const progressPercent = (p: Project) => Math.round((p.filled_slots / p.total_slots) * 100);

  const statusBadge: Record<string, string> = {
    funding:  'badge badge-funding',
    building: 'badge badge-building',
    active:   'badge badge-active',
  };

  const categoryEmoji: Record<string, string> = {
    rental:   '🏠',
    school:   '🏫',
    business: '🏢',
    general:  '📦',
  };

  // ── Render ──
  return (
    <ProtectedLayout>
      <div className="space-y-5 animate-fadeInUp">

        {/* ─── Header ─── */}
        <div>
          <h1 className="font-display font-800 text-2xl text-on-surface">Marketplace</h1>
          <p className="text-on-surface-dim text-sm mt-0.5">Browse projects and buy slots to start earning.</p>
        </div>

        {/* ─── Filter Tabs ─── */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['all', 'funding', 'building', 'active'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`btn text-xs px-3 py-1.5 shrink-0 ${
                filter === f ? 'btn-primary' : 'btn-ghost'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-lg text-sm text-error text-center" style={{ background: 'var(--color-error-dim)' }}>
            {error}
          </div>
        )}

        {/* ─── Project Cards ─── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-on-surface-dim text-sm">No projects match this filter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => {
              const state = purchaseState[project.id] || 'idle';
              const canBuy = project.status === 'funding' && slotsRemaining(project) > 0;

              return (
                <div key={project.id} className="card overflow-hidden">
                  {/* Project Image / Category Banner */}
                  <div
                    className="relative -mx-6 -mt-6 mb-4 h-36 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, var(--color-surface-hover), var(--color-surface-raised))`,
                    }}
                  >
                    <span className="text-6xl opacity-30">{categoryEmoji[project.category] || '📦'}</span>
                    <div className="absolute top-3 left-4">
                      <span className={statusBadge[project.status]}>{project.status}</span>
                    </div>
                    <div className="absolute top-3 right-4">
                      <span className="text-xs font-600 text-on-surface-dim bg-surface-raised px-2 py-0.5 rounded-full">
                        {project.category}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="font-display font-700 text-lg text-on-surface">{project.title}</h3>
                  <p className="text-on-surface-dim text-sm mt-1 leading-relaxed">{project.description}</p>

                  {/* Key Metrics Row */}
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="text-center">
                      <p className="text-on-surface font-600 text-sm">{formatUGX(project.monthly_yield_per_slot)}</p>
                      <p className="text-on-surface-dim text-xs mt-0.5">Monthly Return</p>
                    </div>
                    <div className="text-center">
                      <p className="text-accent font-600 text-sm">{slotsRemaining(project)}</p>
                      <p className="text-on-surface-dim text-xs mt-0.5">Slots Left</p>
                    </div>
                    <div className="text-center">
                      <p className="text-on-surface font-600 text-sm">{formatUGX(project.slot_price)}</p>
                      <p className="text-on-surface-dim text-xs mt-0.5">Per Slot</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-on-surface-dim mb-1.5">
                      <span>Funding Progress</span>
                      <span>{progressPercent(project)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full" style={{ background: 'var(--color-surface-hover)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progressPercent(project)}%`,
                          background: progressPercent(project) === 100
                            ? 'var(--color-success)'
                            : 'var(--color-accent)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Action */}
                  <div className="mt-5">
                    {!canBuy ? (
                      <div className="text-center py-2">
                        <span className="text-on-surface-dim text-sm">
                          {project.status === 'funding' ? 'All slots filled' : `Project is ${project.status}`}
                        </span>
                      </div>
                    ) : state === 'idle' ? (
                      <button
                        className="btn btn-primary w-full"
                        onClick={() => handleBuySlot(project)}
                      >
                        💰 Buy Slot — {formatUGX(project.slot_price)}
                      </button>
                    ) : state === 'paying' ? (
                      <div className="flex items-center justify-center gap-2 py-3">
                        <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                        <span className="text-on-surface-dim text-sm">Opening payment...</span>
                      </div>
                    ) : (
                      <div className="text-center py-3 rounded-lg" style={{ background: 'var(--color-success-dim)' }}>
                        <p className="text-success text-sm font-600">✓ Payment submitted</p>
                        <p className="text-on-surface-dim text-xs mt-0.5">Confirming... please wait a moment.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Payment Selection Modal ─── */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface card w-full max-w-sm animate-zoomIn">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-700 text-lg">Buy Slot</h3>
              <button onClick={() => setSelectedProject(null)} className="text-on-surface-dim hover:text-on-surface text-xl">
                ✕
              </button>
            </div>

            {!paymentMethod ? (
              <div className="space-y-3">
                <p className="text-sm text-on-surface-dim mb-4">Choose your preferred payment method for {selectedProject.title}.</p>
                <button 
                  onClick={() => setPaymentMethod('online')}
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                >
                  💳 Pay Online (Flutterwave)
                </button>
                <button 
                  onClick={() => setPaymentMethod('manual')}
                  className="btn btn-ghost w-full border border-surface-hover flex items-center justify-center gap-2"
                >
                  📲 Manual Mobile Money
                </button>
              </div>
            ) : paymentMethod === 'online' ? (
              <div className="text-center py-6">
                <p className="text-sm mb-6">You will be redirected to Flutterwave to complete your payment of <b>{formatUGX(selectedProject.slot_price)}</b>.</p>
                <div className="flex gap-3">
                  <button onClick={() => setPaymentMethod(null)} className="btn btn-ghost flex-1">Back</button>
                  <button onClick={handleOnlinePayment} className="btn btn-primary flex-1">Proceed</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-surface-raised border border-surface-hover text-sm space-y-3">
                  <p className="font-600 text-accent">Payment Instructions:</p>
                  <div>
                    <p className="text-xs font-700 text-on-surface">MTN (Wafuka Kevin)</p>
                    <p className="text-lg font-mono">0779710365</p>
                  </div>
                  <div>
                    <p className="text-xs font-700 text-on-surface">Airtel (Aisha Nangobi)</p>
                    <p className="text-lg font-mono">0702377999</p>
                  </div>
                  <p className="text-xs text-on-surface-dim italic">Send {formatUGX(selectedProject.slot_price)} then upload the screenshot below.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-600 text-on-surface-dim uppercase tracking-wider">Upload Screenshot</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
                    className="w-full text-sm text-on-surface-dim file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-600 file:bg-accent file:text-white hover:file:opacity-90"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setPaymentMethod(null)} className="btn btn-ghost flex-1" disabled={isUploading}>Back</button>
                  <button 
                    onClick={handleManualInvestment} 
                    className="btn btn-primary flex-1"
                    disabled={!screenshot || isUploading}
                  >
                    {isUploading ? 'Uploading...' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ProtectedLayout>
  );
}
