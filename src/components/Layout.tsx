import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ADMIN_EMAIL } from '../constants';

const SIDEBAR_WIDTH = 220;

// ── シンプルSVGアイコン ──
const IconHome = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 6.5L8 1l7 5.5V15H1V6.5z"/>
    <path d="M5.5 15v-5h5v5"/>
  </svg>
);
const IconPencil = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
  </svg>
);
const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="6.5"/>
    <path d="M8 4.5V8l2.5 2"/>
  </svg>
);
const IconList = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="5" y1="4" x2="14" y2="4"/>
    <line x1="5" y1="8" x2="14" y2="8"/>
    <line x1="5" y1="12" x2="14" y2="12"/>
    <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none"/>
    <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none"/>
    <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none"/>
  </svg>
);
const IconGear = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2.5"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
  </svg>
);
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="6.5" cy="6.5" r="4.5"/>
    <line x1="10" y1="10" x2="14" y2="14"/>
  </svg>
);
const IconUser = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="5.5" r="3"/>
    <path d="M1.5 14.5c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/>
  </svg>
);
const IconChart = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="9" width="3" height="6" rx="0.5"/>
    <rect x="6" y="5" width="3" height="10" rx="0.5"/>
    <rect x="11" y="2" width="3" height="13" rx="0.5"/>
  </svg>
);
const IconInfo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5"/>
    <line x1="8" y1="7" x2="8" y2="12"/>
    <circle cx="8" cy="4.5" r="0.75" fill="currentColor" stroke="none"/>
  </svg>
);

const NAV_ITEMS = [
  { path: '/',               label: 'ホーム',         Icon: IconHome    },
  { path: '/exercise/setup', label: '演習モード',     Icon: IconPencil  },
  { path: '/exam/setup',     label: '模試モード',     Icon: IconClock   },
  { path: '/questions',      label: '問題一覧',       Icon: IconList    },
  { path: '/stats',          label: '統計・分析',     Icon: IconChart   },
  { path: '/admin',          label: '管理画面',       Icon: IconGear,   adminOnly: true },
  { path: '/architecture',   label: 'システム構成',   Icon: IconInfo,   bottom: true },
];

const AI_LINKS = [
  { label: 'ChatGPT', url: 'https://chatgpt.com/',          color: '#10a37f' },
  { label: 'Gemini',  url: 'https://gemini.google.com/',    color: '#4285f4' },
  { label: 'Claude',  url: 'https://claude.ai/',            color: '#d97757' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(() => localStorage.getItem('sidebarOpen') !== 'false');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/questions?keyword=${encodeURIComponent(q)}`);
    setSearchQuery('');
    if (isMobile) setOpen(false);
  };

  const toggle = () => setOpen(prev => {
    if (!isMobile) localStorage.setItem('sidebarOpen', String(!prev));
    return !prev;
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const navItems = NAV_ITEMS.filter(item => !(item as any).adminOnly || isAdmin);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>

      {/* ── ヘッダー ── */}
      <header style={{
        height: 40, minHeight: 40, background: '#232f3e',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        gap: 12, zIndex: 200, flexShrink: 0,
      }}>
        {/* ハンバーガー */}
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#d5dbdb', fontSize: 18, lineHeight: 1, padding: '0 4px',
          display: 'flex', alignItems: 'center',
        }} title={open ? 'メニューを閉じる' : 'メニューを開く'}>
          &#9776;
        </button>

        {/* サービス名 */}
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
          <span style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>AWS</span>
          <span style={{ color: 'white', fontWeight: 400, fontSize: 14, marginLeft: 6, whiteSpace: 'nowrap' }}>
            {isMobile ? 'Quiz' : 'Quiz Practice'}
          </span>
        </div>

        {/* 検索バー */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: isMobile ? 'none' : 500, minWidth: 0 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isMobile ? '検索' : 'サービス、機能、ドキュメントなどを検索'}
              style={{
                width: '100%', padding: '4px 10px 4px 32px',
                borderRadius: 2, border: '1px solid #545b64',
                background: 'white', color: '#16191f',
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
            <span style={{ position: 'absolute', left: 9, color: '#545b64', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <IconSearch />
            </span>
          </div>
        </form>

        {/* AI リンク（デスクトップのみ） */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ color: '#879596', fontSize: 11, marginRight: 4 }}>AI</span>
            {AI_LINKS.map(ai => (
              <a key={ai.label} href={ai.url} target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 2,
                  textDecoration: 'none', fontSize: 12, color: '#d5dbdb',
                  border: '1px solid #3a4a5a',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3a4a5a'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ai.color, flexShrink: 0 }} />
                {ai.label}
              </a>
            ))}
          </div>
        )}

        {/* ユーザー情報 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {user && !isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#879596', display: 'flex', alignItems: 'center' }}><IconUser /></span>
              <span style={{ color: '#d5dbdb', fontSize: 12, fontWeight: 700 }}>{user.email?.split('@')[0]}</span>
            </div>
          )}
          <button onClick={handleSignOut} style={{
            background: 'none', border: 'none',
            color: '#d5dbdb', fontSize: 12, padding: '4px 0', cursor: 'pointer', fontWeight: 700,
          }}>
            {isMobile ? '↩' : 'ログアウト'}
          </button>
        </div>
      </header>

      {/* ── ボディ（サイドバー + コンテンツ） ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* モバイル: オーバーレイ背景 */}
        {isMobile && open && (
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, top: 40, background: 'rgba(0,0,0,0.5)', zIndex: 150,
          }} />
        )}

        {/* サイドバー */}
        <nav style={{
          width: open ? SIDEBAR_WIDTH : 0,
          minWidth: open ? SIDEBAR_WIDTH : 0,
          background: '#ffffff',
          borderRight: open ? '1px solid #eaeded' : 'none',
          overflow: 'hidden',
          transition: 'width 0.15s ease-out, min-width 0.15s ease-out',
          display: 'flex', flexDirection: 'column',
          ...(isMobile ? {
            position: 'fixed', top: 40, left: 0,
            height: 'calc(100vh - 40px)', zIndex: 160,
            boxShadow: open ? '2px 0 8px rgba(0,0,0,0.15)' : 'none',
          } : {}),
        }}>
          <div style={{ width: SIDEBAR_WIDTH, paddingTop: 8, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {navItems.filter(item => !(item as any).bottom).map(({ path, label, Icon }) => {
              const active = isActive(path);
              return (
                <button
                  key={path}
                  onClick={() => { navigate(path); if (isMobile) setOpen(false); }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 20px',
                    background: active ? '#f2f3f3' : 'none',
                    border: 'none',
                    borderLeft: `3px solid ${active ? '#0073bb' : 'transparent'}`,
                    cursor: 'pointer',
                    color: active ? '#0073bb' : '#545b64',
                    fontSize: 14,
                    fontWeight: active ? 700 : 400,
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f2f3f3'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', opacity: active ? 1 : 0.7 }}>
                    <Icon />
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}

            {/* 下部固定ナビ（システム構成など） */}
            <div style={{ marginTop: 'auto' }}>
              {navItems.filter(item => (item as any).bottom).map(({ path, label, Icon }) => {
                const active = isActive(path);
                return (
                  <button
                    key={path}
                    onClick={() => { navigate(path); if (isMobile) setOpen(false); }}
                    style={{
                      width: '100%', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 20px',
                      background: active ? '#f2f3f3' : 'none',
                      border: 'none',
                      borderTop: '1px solid #eaeded',
                      borderLeft: `3px solid ${active ? '#0073bb' : 'transparent'}`,
                      cursor: 'pointer',
                      color: active ? '#0073bb' : '#879596',
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f2f3f3'; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', opacity: active ? 1 : 0.6 }}>
                      <Icon />
                    </span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* モバイルのみ: AI リンクをサイドバー下部に表示 */}
            {isMobile && (
              <div style={{ borderTop: '1px solid #eaeded', padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: '#aab7b8', marginBottom: 8, paddingLeft: 4 }}>AI で調べる</div>
                {AI_LINKS.map(ai => (
                  <a key={ai.label} href={ai.url} target="_blank" rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', marginBottom: 4, borderRadius: 2,
                      textDecoration: 'none', fontSize: 13, color: '#16191f',
                      border: '1px solid #eaeded', background: 'white',
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: ai.color, flexShrink: 0 }} />
                    {ai.label}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aab7b8' }}>↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* メインコンテンツ */}
        <main style={{
          flex: 1, overflow: 'auto',
          background: '#f2f3f3',
          width: isMobile ? '100%' : undefined,
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
