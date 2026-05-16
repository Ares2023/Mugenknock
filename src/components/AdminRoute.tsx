import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import { useAuth } from '../contexts/AuthContext';
import { ADMIN_EMAIL, API_ENDPOINT } from '../constants';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [adminEmails, setAdminEmails] = useState<string[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAdminEmails([]); return; }
    fetchAuthSession()
      .then(session => {
        const token = session.tokens?.idToken?.toString();
        return fetch(`${API_ENDPOINT}/admin/settings/admins`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      })
      .then(r => r.ok ? r.json() : { emails: [] })
      .then(d => setAdminEmails(d.emails ?? []))
      .catch(() => setAdminEmails([]));
  }, [loading, user]);

  if (loading || adminEmails === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', background: '#1a2433' }}>
        <p style={{ color: '#879596' }}>読み込み中...</p>
      </div>
    );
  }

  const email = user?.email ?? '';
  if (!user || (email !== ADMIN_EMAIL && !adminEmails.includes(email))) {
    return <Navigate to="/admin-login" replace />;
  }

  return <>{children}</>;
}
