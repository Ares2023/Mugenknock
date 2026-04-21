import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ADMIN_EMAIL } from '../constants';

const SIDEBAR_WIDTH = 220;

const NAV_ITEMS = [
  { path: '/',               label: 'ホーム',     icon: '⊞', adminOnly: false },
  { path: '/exercise/setup', label: '演習モード', icon: '✎', adminOnly: false },
  { path: '/exam/setup',     label: '模試モード', icon: '⏱', adminOnly: false },
  { path: '/questions',      label: '問題一覧',   icon: '☰', adminOnly: false },
  { path: '/admin',          label: '管理画面',   icon: '⚙', adminOnly: true  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(() =>
    localStorage.getItem('sidebarOpen') !== 'false'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const isAdmin = user?.username === ADMIN_EMAIL;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/questions?keyword=${encodeURIComponent(q)}`);
    setSearchQuery('');
  };

  const toggle = () => setOpen(prev => {
    localStorage.setItem('sidebarOpen', String(!prev));
    return !prev;
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>

      {/* ── ヘッダー ── */}
      <header style={{
        height: 56, minHeight: 56, background: '#0f1111',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        gap: 12, zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,.5)',
      }}>
        {/* ハンバーガー（丸） */}
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#d5dbdb', fontSize: 18, lineHeight: 1,
          width: 36, height: 36, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s', flexShrink: 0,
        }}
          title={open ? 'メニューを閉じる' : 'メニューを開く'}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
        >
          &#9776;
        </button>

        {/* サービス名 */}
        <span
          onClick={() => navigate('/')}
          style={{ color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        >
          AWS Quiz
        </span>
        <span style={{ color: '#ff9900', fontSize: 11, marginTop: 2, whiteSpace: 'nowrap' }}>Practice</span>

        {/* 検索バー */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 420, margin: '0 16px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 10, color: '#aaa', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="サービス名・キーワードで検索"
              style={{
                width: '100%', padding: '6px 12px 6px 32px',
                borderRadius: 4, border: '1px solid #4a5568',
                background: '#1a2332', color: 'white',
                fontSize: 13, outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#ff9900'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#4a5568'; }}
            />
          </div>
        </form>

        {/* 右側ユーザー情報 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {user && (
            <span style={{ color: '#d5dbdb', fontSize: 13 }}>{user.username}</span>
          )}
          <button onClick={handleSignOut} style={{
            background: 'none', border: '1px solid #4a5568', borderRadius: 4,
            color: '#d5dbdb', fontSize: 13, padding: '4px 12px', cursor: 'pointer',
          }}>
            ログアウト
          </button>
        </div>
      </header>

      {/* ── ボディ（サイドバー + コンテンツ） ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* サイドバー */}
        <nav style={{
          width: open ? SIDEBAR_WIDTH : 0,
          minWidth: open ? SIDEBAR_WIDTH : 0,
          background: 'white',
          borderRight: '1px solid #e0e0e0',
          overflow: 'hidden',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ width: SIDEBAR_WIDTH, paddingTop: 8, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 20px',
                    background: active ? '#fef6e8' : 'none',
                    border: 'none',
                    borderLeftColor: active ? '#ff9900' : 'transparent',
                    borderLeftWidth: 3,
                    borderLeftStyle: 'solid',
                    cursor: 'pointer',
                    color: active ? '#c45200' : '#555',
                    fontSize: 14,
                    fontWeight: active ? 'bold' : 'normal',
                    transition: 'background 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f5f5f5'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{ fontSize: 16, opacity: 0.7 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* AI リンク */}
            <div style={{ marginTop: 'auto', borderTop: '1px solid #e8e8e8', padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8, paddingLeft: 4 }}>AI で調べる</div>
              {[
                { label: 'ChatGPT', url: 'https://chatgpt.com/', color: '#10a37f' },
                { label: 'Gemini',  url: 'https://gemini.google.com/', color: '#4285f4' },
                { label: 'Claude',  url: 'https://claude.ai/', color: '#d97757' },
              ].map(ai => (
                <a key={ai.label} href={ai.url} target="_blank" rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', marginBottom: 4, borderRadius: 6,
                    textDecoration: 'none', fontSize: 13, color: '#333',
                    border: '1px solid #e8e8e8', background: 'white',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white'; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: ai.color, flexShrink: 0 }} />
                  {ai.label}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#bbb' }}>↗</span>
                </a>
              ))}
            </div>
          </div>
        </nav>

        {/* メインコンテンツ */}
        <main style={{
          flex: 1, overflow: 'auto',
          background: '#f2f3f3',
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
