'use client';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase.client';
import { useAuth } from '@/lib/AuthContext';

export default function AdminView() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'verification_requests'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [user]);

  const handleVerify = async (requestId: string) => {
    setVerifyingId(requestId);
    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId }),
      });
      if (!res.ok) alert('Failed to verify');
    } catch (err) {
      alert('Error verifying');
    } finally {
      setVerifyingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-accent border-t-transparent animate-spin rounded-full" /></div>;

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="font-display font-800 text-2xl">Admin Panel</h2>
      <div className="space-y-4">
        {requests.filter(r => r.status === 'pending').map(r => (
          <div key={r.id} className="card">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-700 uppercase text-accent mb-1">{r.type}</p>
                <p className="font-800 text-lg">{r.amount.toLocaleString()} UGX</p>
                <p className="text-xs opacity-60">{r.email}</p>
              </div>
              <button 
                onClick={() => handleVerify(r.id)} 
                disabled={verifyingId === r.id}
                className="btn btn-primary text-xs px-4"
              >
                {verifyingId === r.id ? '...' : 'Approve'}
              </button>
            </div>
            {r.screenshot_url && (
              <a href={r.screenshot_url} target="_blank" rel="noreferrer" className="block relative aspect-video rounded-lg overflow-hidden border">
                <img src={r.screenshot_url} alt="Screenshot" className="object-cover w-full h-full" />
              </a>
            )}
          </div>
        ))}
        {requests.filter(r => r.status === 'pending').length === 0 && (
          <p className="text-center opacity-60 py-10">No pending requests</p>
        )}
      </div>
    </div>
  );
}
