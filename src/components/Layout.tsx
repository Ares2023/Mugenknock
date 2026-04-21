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
  const isAdmin = user?.email === ADMIN_EMAIL;

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
        height: 40, minHeight: 40, background: '#232f3e',
        display: 'flex', alignItems: 'center', padding: '0 20px',
        gap: 20, zIndex: 10,
      }}>
        {/* ハンバーガー（丸） */}
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#d5dbdb', fontSize: 20, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}
          title={open ? 'メニューを閉じる' : 'メニューを開く'}
        >
          &#9776;
        </button>

        {/* サービス名 */}
        <div
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ color: 'white', fontWeight: 800, fontSize: 15, letterSpacing: '0.2px' }}>
            AWS
          </span>
          <span style={{ color: 'white', fontWeight: 400, fontSize: 15, marginLeft: 6 }}>
            Quiz Practice
          </span>
        </div>

        {/* 検索バー */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 540 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="サービス、機能、ドキュメントなどを検索"
              style={{
                width: '100%', padding: '4px 12px 4px 36px',
                borderRadius: 2, border: '1px solid #545b64',
                background: 'white', color: '#16191f',
                fontSize: 14, outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: 12, color: '#545b64', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
          </div>
        </form>

        {/* 右側ユーザー情報 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#545b64', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white' }}>👤</div>
              <span style={{ color: '#d5dbdb', fontSize: 12, fontWeight: 700 }}>{user.email?.split('@')[0]}</span>
            </div>
          )}
          <button onClick={handleSignOut} style={{
            background: 'none', border: 'none',
            color: '#d5dbdb', fontSize: 12, padding: '4px 0', cursor: 'pointer',
            fontWeight: 700
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
          background: '#ffffff',
          borderRight: '1px solid #eaeded',
          overflow: 'hidden',
          transition: 'width 0.1s ease-out, min-width 0.1s ease-out',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ width: SIDEBAR_WIDTH, paddingTop: 12, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 20px',
                    background: active ? '#f2f3f3' : 'none',
                    border: 'none',
                    borderLeftColor: active ? '#0073bb' : 'transparent',
                    borderLeftWidth: 4,
                    borderLeftStyle: 'solid',
                    cursor: 'pointer',
                    color: active ? '#000' : '#545b64',
                    fontSize: 14,
                    fontWeight: active ? 700 : 400,
                    transition: 'background 0.1s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f2f3f3'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{ fontSize: 16, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
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
