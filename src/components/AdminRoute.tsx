import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ADMIN_EMAIL, API_ENDPOINT } from '../constants';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [adminEmails, setAdminEmails] = useState<string[] | null>(null);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/settings/admins`)
      .then(r => r.json())
      .then(d => setAdminEmails(d.emails ?? []))
      .catch(() => setAdminEmails([]));
  }, []);

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
