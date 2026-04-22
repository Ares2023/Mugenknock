import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ADMIN_EMAIL } from '../constants';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', background: '#1a2433' }}>
        <p style={{ color: '#879596' }}>読み込み中...</p>
      </div>
    );
  }

  if (!user || user.email !== ADMIN_EMAIL) {
    return <Navigate to="/admin-login" replace />;
  }

  return <>{children}</>;
}
