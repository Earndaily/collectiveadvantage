'use client';
// =============================================================
// src/app/admin/page.tsx – Admin Panel
// ─────────────────────────────────────────────
// Protected by requireAdmin flag in ProtectedLayout.
// Capabilities:
//   1. Create new projects (title, goal, slots, yield, etc.)
//   2. View all projects with live status
//   3. Manual MoMo verification table (for MVP where webhooks
//      may not be instant — admin can manually confirm payments)
// =============================================================

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase.client';
import ProtectedLayout from '@/components/ProtectedLayout';

interface Project {
  id: string;
  title: string;
  category: string;
  total_goal: number;
  slot_price: number;
  total_slots: number;
  filled_slots: number;
  monthly_yield_per_slot: number;
  status: string;
}

interface VerificationRequest {
  id: string;
  uid: string;
  email: string;
  phone: string;
  screenshot_url: string;
  amount: number;
  status: string;
  type: string;
  project_id?: string;
  createdAt: any;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // New project form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'rental',
    total_goal: '',
    slot_price: '',
    total_slots: '',
    monthly_yield_per_slot: '',
    image_url: '',
  });

  // ── Fetch data ──
  useEffect(() => {
    if (!user) return;

    // Listen to projects
    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
      setLoading(false);
    });

    // Listen to verification requests
    const qVer = query(collection(db, 'verification_requests'), orderBy('createdAt', 'desc'));
    const unsubVer = onSnapshot(qVer, (snap) => {
      setVerificationRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as VerificationRequest)));
    });

    return () => {
      unsubProjects();
      unsubVer();
    };
  }, [user]);

  // ── Create a new project ──
  const handleCreate = async () => {
    setError('');
    setSuccess('');
    setCreateLoading(true);

    // Validation: slot_price × total_slots must equal total_goal
    const goal = parseInt(form.total_goal);
    const price = parseInt(form.slot_price);
    const slots = parseInt(form.total_slots);

    if (!form.title || !goal || !price || !slots || !form.monthly_yield_per_slot) {
      setError('All fields are required.');
      setCreateLoading(false);
      return;
    }

    if (price * slots !== goal) {
      setError(`Validation: ${price.toLocaleString()} × ${slots} = ${(price * slots).toLocaleString()}, but Total Goal is ${goal.toLocaleString()}. They must match.`);
      setCreateLoading(false);
      return;
    }

    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          category: form.category,
          total_goal: goal,
          slot_price: price,
          total_slots: slots,
          monthly_yield_per_slot: parseInt(form.monthly_yield_per_slot),
          image_url: form.image_url || null,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`✓ Project "${form.title}" created!`);
        setForm({ title: '', description: '', category: 'rental', total_goal: '', slot_price: '', total_slots: '', monthly_yield_per_slot: '', image_url: '' });
      } else {
        setError(data.error || 'Failed to create project.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  // ── Manual Verification ──
  const handleVerify = async (requestId: string) => {
    setError('');
    setSuccess('');
    setVerifyingId(requestId);

    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('✓ Request approved and processed successfully.');
      } else {
        setError(data.error || 'Failed to verify request.');
      }
    } catch (err) {
      setError('Network error.');
    } finally {
      setVerifyingId(null);
    }
  };

  // ── Helpers ──
  const formatUGX = (n: number) => `${n.toLocaleString()} UGX`;

  const statusBadge: Record<string, string> = {
    funding:  'badge badge-funding',
    building: 'badge badge-building',
    active:   'badge badge-active',
  };

  // ── Render ──
  return (
    <ProtectedLayout requireAdmin>
      <div className="space-y-6 animate-fadeInUp">

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-800 text-2xl text-on-surface">Admin Panel</h1>
            <p className="text-on-surface-dim text-sm mt-0.5">Manage projects & verify payments.</p>
          </div>
          <span className="badge badge-active">Admin</span>
        </div>

        {/* Feedback Messages */}
        {success && (
          <div className="p-3 rounded-lg text-sm text-success" style={{ background: 'var(--color-success-dim)' }}>
            {success}
          </div>
        )}
        {error && (
          <div className="p-3 rounded-lg text-sm text-error" style={{ background: 'var(--color-error-dim)' }}>
            {error}
          </div>
        )}

        {/* ─── CREATE NEW PROJECT ─── */}
        <div className="card">
          <h2 className="font-display font-700 text-base text-on-surface mb-4">➕ New Project</h2>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-600 text-on-surface-dim mb-1 uppercase tracking-wide">Title</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., Kampala Rental Block A"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-600 text-on-surface-dim mb-1 uppercase tracking-wide">Category</label>
                <select
                  className="input-field"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="rental">🏠 Rental</option>
                  <option value="school">🏫 School</option>
                  <option value="business">🏢 Business</option>
                  <option value="general">📦 General</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-600 text-on-surface-dim mb-1 uppercase tracking-wide">Description</label>
              <textarea
                className="input-field resize-none"
                rows={2}
                placeholder="Brief project description..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-600 text-on-surface-dim mb-1 uppercase tracking-wide">Total Goal (UGX)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="5000000"
                  value={form.total_goal}
                  onChange={(e) => setForm({ ...form, total_goal: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-600 text-on-surface-dim mb-1 uppercase tracking-wide">Slot Price (UGX)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="50000"
                  value={form.slot_price}
                  onChange={(e) => setForm({ ...form, slot_price: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-600 text-on-surface-dim mb-1 uppercase tracking-wide">Total Slots</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="100"
                  value={form.total_slots}
                  onChange={(e) => setForm({ ...form, total_slots: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-600 text-on-surface-dim mb-1 uppercase tracking-wide">Monthly Yield/Slot (UGX)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="2500"
                  value={form.monthly_yield_per_slot}
                  onChange={(e) => setForm({ ...form, monthly_yield_per_slot: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-600 text-on-surface-dim mb-1 uppercase tracking-wide">Image URL <span className="opacity-50">(optional)</span></label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="https://..."
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
              </div>
            </div>

            <button
              className="btn btn-primary w-full"
              onClick={handleCreate}
              disabled={createLoading}
            >
              {createLoading ? 'Creating...' : '✨ Create Project'}
            </button>
          </div>
        </div>

        {/* ─── ALL PROJECTS TABLE ─── */}
        <div className="card">
          <h2 className="font-display font-700 text-base text-on-surface mb-4">📋 All Projects</h2>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <p className="text-on-surface-dim text-sm text-center py-6">No projects exist yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <th className="text-left py-2 text-on-surface-dim font-600 text-xs uppercase tracking-wide">Project</th>
                    <th className="text-left py-2 text-on-surface-dim font-600 text-xs uppercase tracking-wide hidden sm:table-cell">Goal</th>
                    <th className="text-left py-2 text-on-surface-dim font-600 text-xs uppercase tracking-wide">Slots</th>
                    <th className="text-left py-2 text-on-surface-dim font-600 text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="py-3">
                        <p className="text-on-surface font-500">{p.title}</p>
                        <p className="text-on-surface-dim text-xs">{p.category}</p>
                      </td>
                      <td className="py-3 text-on-surface hidden sm:table-cell">{formatUGX(p.total_goal)}</td>
                      <td className="py-3">
                        <span className="text-accent font-600">{p.filled_slots}</span>
                        <span className="text-on-surface-dim">/{p.total_slots}</span>
                      </td>
                      <td className="py-3">
                        <span className={statusBadge[p.status]}>{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ─── MANUAL MOMO VERIFICATION ─── */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-700 text-base text-on-surface">📱 MoMo Verification</h2>
            <span className="text-xs text-on-surface-dim px-2 py-0.5 rounded-full" style={{ background: 'var(--color-surface-hover)' }}>
              Manual Mode
            </span>
          </div>

          {verificationRequests.length === 0 ? (
            <p className="text-on-surface-dim text-sm text-center py-4">No pending verifications.</p>
          ) : (
            <div className="space-y-4">
              {verificationRequests.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col gap-3 p-4 rounded-xl border border-border"
                  style={{ background: 'var(--color-surface-raised)' }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-on-surface text-sm font-700 uppercase tracking-tight">
                        {v.type === 'reg_fee' ? '🔐 Activation' : '📈 Investment'}
                      </p>
                      <p className="text-accent font-800 text-lg">{formatUGX(v.amount)}</p>
                      <p className="text-on-surface-dim text-xs mt-1">
                        User: {v.email || v.uid}
                      </p>
                      {v.type === 'investment' && v.project_id && (
                        <p className="text-xs text-on-surface-dim mt-0.5">
                          Project: <span className="text-on-surface font-500">{projects.find(p => p.id === v.project_id)?.title || v.project_id}</span>
                        </p>
                      )}
                    </div>
                    <span className={`badge ${v.status === 'pending' ? 'badge-funding' : 'badge-active'}`}>
                      {v.status}
                    </span>
                  </div>

                  {v.screenshot_url && (
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-surface-hover border border-border">
                      <img
                        src={v.screenshot_url}
                        alt="Payment Screenshot"
                        className="object-contain w-full h-full"
                      />
                      <a
                        href={v.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-md backdrop-blur-sm"
                      >
                        View Full Size ↗
                      </a>
                    </div>
                  )}

                  {v.status === 'pending' && (
                    <button
                      className="btn btn-primary w-full"
                      onClick={() => handleVerify(v.id)}
                      disabled={verifyingId === v.id}
                    >
                      {verifyingId === v.id ? 'Verifying...' : '✓ Approve & Activate'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </ProtectedLayout>
  );
}
