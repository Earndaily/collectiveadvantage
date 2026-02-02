'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db, storage } from '@/lib/firebase.client';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

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
}

export default function InvestView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchaseState, setPurchaseState] = useState<Record<string, 'idle' | 'pending'>>({});
  const [filter, setFilter] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchProjects = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError('Failed to load projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, [user]);

  const handleManualInvestment = async () => {
    if (!user || !selectedProject || !screenshot) return;
    setIsUploading(true);
    setError('');
    try {
      const fileRef = ref(storage, `investments/${user.uid}/${Date.now()}_${screenshot.name}`);
      await uploadBytes(fileRef, screenshot);
      const downloadURL = await getDownloadURL(fileRef);

      await addDoc(collection(db, 'verification_requests'), {
        uid: user.uid,
        email: user.email,
        screenshot_url: downloadURL,
        amount: selectedProject.slot_price,
        status: 'pending',
        type: 'investment',
        project_id: selectedProject.id,
        createdAt: serverTimestamp(),
      });

      setPurchaseState(prev => ({ ...prev, [selectedProject.id]: 'pending' }));
      setSelectedProject(null);
      setScreenshot(null);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request.');
    } finally {
      setIsUploading(false);
    }
  };

  const filteredProjects = filter === 'all' ? projects : projects.filter(p => p.status === filter);
  const formatUGX = (n: number) => `${n.toLocaleString()} UGX`;
  const slotsRemaining = (p: Project) => p.total_slots - p.filled_slots;
  const progressPercent = (p: Project) => Math.round((p.filled_slots / p.total_slots) * 100);

  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <h1 className="font-display font-800 text-2xl text-on-surface">Marketplace</h1>
        <p className="text-on-surface-dim text-sm mt-0.5">Invest in real-world assets.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'funding', 'building', 'active'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`btn text-xs px-3 py-1.5 shrink-0 ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map(project => {
            const state = purchaseState[project.id] || 'idle';
            return (
              <div key={project.id} className="card">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-display font-700 text-lg">{project.title}</h3>
                  <span className="badge badge-funding">{project.status}</span>
                </div>
                <p className="text-on-surface-dim text-sm mb-4">{project.description}</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
                  <div className="p-2 bg-surface-hover rounded-lg">
                    <p className="font-700">{formatUGX(project.slot_price)}</p>
                    <p className="opacity-60">Price</p>
                  </div>
                  <div className="p-2 bg-surface-hover rounded-lg">
                    <p className="font-700 text-accent">{slotsRemaining(project)}</p>
                    <p className="opacity-60">Left</p>
                  </div>
                  <div className="p-2 bg-surface-hover rounded-lg">
                    <p className="font-700 text-success">{progressPercent(project)}%</p>
                    <p className="opacity-60">Funded</p>
                  </div>
                </div>
                {state === 'idle' ? (
                  <button onClick={() => setSelectedProject(project)} className="btn btn-primary w-full" disabled={slotsRemaining(project) <= 0}>
                    💰 Buy Slot — {formatUGX(project.slot_price)}
                  </button>
                ) : (
                  <div className="text-center py-2 bg-success-dim text-success rounded-lg text-sm font-600">✓ Pending Approval</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface card w-full max-w-sm animate-zoomIn">
            <h3 className="font-display font-700 text-lg mb-4">Manual Payment</h3>
            <div className="p-3 rounded-lg bg-surface-raised border mb-4 text-sm space-y-2">
              <p className="font-600 text-accent underline">Send {formatUGX(selectedProject.slot_price)} to:</p>
              <p>MTN: <b>0779710365</b> (Wafuka Kevin)</p>
              <p>Airtel: <b>0702377999</b> (Aisha Nangobi)</p>
            </div>
            <input type="file" accept="image/*" onChange={e => setScreenshot(e.target.files?.[0] || null)} className="mb-4 block w-full text-sm text-on-surface-dim file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-600 file:bg-accent file:text-white" />
            <div className="flex gap-2">
              <button onClick={() => setSelectedProject(null)} className="btn btn-ghost flex-1">Cancel</button>
              <button onClick={handleManualInvestment} disabled={!screenshot || isUploading} className="btn btn-primary flex-1">{isUploading ? 'Uploading...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
