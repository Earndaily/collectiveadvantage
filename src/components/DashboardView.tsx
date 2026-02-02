'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase.client';

interface DashboardData {
  walletBalance: number;
  totalInvested: number;
  monthlyIncome: number;
  referralEarnings: number;
  dividendEarnings: number;
  activeInvestments: any[];
  recentTransactions: any[];
}

export default function DashboardView({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!user) return;
    try {
      const uDoc = await getDoc(doc(db, 'users', user.uid));
      const txSnap = await getDocs(query(collection(db, 'transactions'), where('user_uid', '==', user.uid)));
      const txs = txSnap.docs.map(d => d.data());

      let invested = 0, referral = 0, dividend = 0;
      const invMap: Record<string, number> = {};

      txs.forEach((tx: any) => {
        if (tx.type === 'slot_purchase' && tx.status === 'completed') {
          invested += tx.amount;
          invMap[tx.project_id] = (invMap[tx.project_id] || 0) + 1;
        }
        if (tx.type === 'referral_bonus' && tx.status === 'completed') referral += tx.amount;
        if (tx.type === 'dividend' && tx.status === 'completed') dividend += tx.amount;
      });

      const activeInvs = [];
      let income = 0;
      for (const [pid, slots] of Object.entries(invMap)) {
        const pDoc = await getDoc(doc(db, 'projects', pid));
        if (pDoc.exists()) {
          const p = pDoc.data();
          if (p.status === 'active') income += (p.monthly_yield_per_slot * slots);
          activeInvs.push({ id: pid, title: p.title, slots, yield: p.monthly_yield_per_slot, status: p.status });
        }
      }

      setData({
        walletBalance: uDoc.data()?.wallet_balance || 0,
        totalInvested: invested,
        monthlyIncome: income,
        referralEarnings: referral,
        dividendEarnings: dividend,
        activeInvestments: activeInvs,
        recentTransactions: txs.slice(-5).reverse(),
      });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [user]);

  const formatUGX = (n: number) => `${n.toLocaleString()} UGX`;

  if (loading || !data) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-accent border-t-transparent animate-spin rounded-full" /></div>;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4"><p className="text-xs opacity-60">Account Balance</p><p className="text-xl font-800 text-accent">{formatUGX(data.walletBalance)}</p></div>
        <div className="card p-4"><p className="text-xs opacity-60">Total Earnings</p><p className="text-xl font-800">{formatUGX(data.referralEarnings + data.dividendEarnings)}</p></div>
        <div className="card p-4"><p className="text-xs opacity-60">Invested</p><p className="text-xl font-800">{formatUGX(data.totalInvested)}</p></div>
        <div className="card p-4"><p className="text-xs opacity-60">Monthly Yield</p><p className="text-xl font-800 text-success">{formatUGX(data.monthlyIncome)}</p></div>
      </div>

      <div className="card bg-surface-hover border-accent/20">
        <p className="text-xs font-700 uppercase tracking-widest text-accent mb-2">Refer & Earn</p>
        <p className="text-sm mb-4">Earn 4,000 UGX for every active user you refer.</p>
        <button className="btn btn-primary w-full text-xs" onClick={() => navigator.clipboard.writeText(window.location.origin + '?ref=' + user?.uid)}>Copy Referral Link</button>
      </div>

      <div>
        <h3 className="font-700 mb-3">My Investments</h3>
        {data.activeInvestments.length === 0 ? (
          <div className="card text-center py-8"><p className="text-sm opacity-60 mb-3">No investments yet</p><button onClick={() => onNavigate('invest')} className="btn btn-ghost border w-full">Browse Projects</button></div>
        ) : (
          <div className="space-y-3">
            {data.activeInvestments.map(inv => (
              <div key={inv.id} className="card flex justify-between items-center">
                <div><p className="font-600 text-sm">{inv.title}</p><p className="text-[10px] opacity-60">{inv.slots} slot(s)</p></div>
                <div className="text-right"><p className="text-success text-xs font-700">+{formatUGX(inv.yield * inv.slots)}/mo</p><span className="badge text-[10px]">{inv.status}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
