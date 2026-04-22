import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin-login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'sans-serif', background: '#f2f3f3' }}>
      <header style={{
        height: 44, minHeight: 44, background: '#1a2433',
        display: 'flex', alignItems: 'center', padding: '0 20px',
        gap: 12, flexShrink: 0, borderBottom: '2px solid #e47911',
      }}>
        <span style={{ color: '#e47911', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', userSelect: 'none' }}>
          ADMIN
        </span>
        <span style={{ color: '#3a4a5a', fontSize: 14, userSelect: 'none' }}>|</span>
        <span style={{ color: '#d5dbdb', fontWeight: 700, fontSize: 14 }}>管理画面</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && (
            <span style={{ color: '#879596', fontSize: 12 }}>{user.email}</span>
          )}
          <button onClick={handleSignOut} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.3)',
            color: '#d5dbdb', fontSize: 12, padding: '4px 12px',
            borderRadius: 9999, cursor: 'pointer', fontWeight: 700,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            ログアウト
          </button>
          <button onClick={() => navigate('/')} style={{
            background: 'none', border: 'none',
            color: '#879596', fontSize: 12, padding: '4px 8px',
            cursor: 'pointer', fontWeight: 400,
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#d5dbdb'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#879596'; }}
          >
            ← サイトへ戻る
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
