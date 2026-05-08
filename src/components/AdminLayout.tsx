import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const IconSun = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const IconMoon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin-login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'sans-serif', background: 'var(--color-bg-main)' }}>
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
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            style={{ background: 'none', border: 'none', color: '#d5dbdb', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', borderRadius: 6, opacity: 0.8 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.8'; }}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
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
