'use client';
import { useState, useEffect } from 'react';
import ProtectedLayout from '@/components/ProtectedLayout';
import DashboardView from '@/components/DashboardView';
import InvestView from '@/components/InvestView';
import AdminView from '@/components/AdminView';
import { useAuth } from '@/lib/AuthContext';

export default function AppShell() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'invest' | 'admin'>('dashboard');
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      if (user) {
        const idTokenResult = await user.getIdTokenResult();
        setIsAdmin(!!idTokenResult.claims.admin);
      }
    }
    checkAdmin();
  }, [user]);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView onNavigate={setCurrentView} />;
      case 'invest':    return <InvestView />;
      case 'admin':     return <AdminView />;
      default:          return <DashboardView onNavigate={setCurrentView} />;
    }
  };

  return (
    <ProtectedLayout currentView={currentView} onSetView={setCurrentView} isAdmin={isAdmin}>
      {renderView()}
    </ProtectedLayout>
  );
}
