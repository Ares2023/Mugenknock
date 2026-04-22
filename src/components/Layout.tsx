import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Breadcrumb from './Breadcrumb';

type BreadcrumbItem = { label: string; path?: string };

const BREADCRUMBS: Record<string, BreadcrumbItem[]> = {
  '/questions':        [{ label: 'ホーム', path: '/' }, { label: '問題一覧' }],
  '/exercise/setup':   [{ label: 'ホーム', path: '/' }, { label: '演習設定' }],
  '/exercise/session': [{ label: 'ホーム', path: '/' }, { label: '演習設定', path: '/exercise/setup' }, { label: '演習中' }],
  '/exam/setup':       [{ label: 'ホーム', path: '/' }, { label: '模試設定' }],
  '/exam/session':     [{ label: 'ホーム', path: '/' }, { label: '模試設定', path: '/exam/setup' }, { label: '模試中' }],
  '/result':           [{ label: 'ホーム', path: '/' }, { label: '結果' }],
  '/stats':            [{ label: 'ホーム', path: '/' }, { label: '統計・分析' }],
  '/architecture':     [{ label: 'ホーム', path: '/' }, { label: 'システム構成' }],
  '/release-notes':    [{ label: 'ホーム', path: '/' }, { label: 'リリースノート' }],
};

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
const IconBell = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5a5 5 0 0 1 5 5v3l1 1.5H2L3 9.5v-3a5 5 0 0 1 5-5z"/>
    <path d="M6.5 13a1.5 1.5 0 0 0 3 0"/>
  </svg>
);

const NAV_ITEMS = [
  { path: '/',               label: 'ホーム',         Icon: IconHome    },
  { path: '/exercise/setup', label: '演習モード',     Icon: IconPencil  },
  { path: '/exam/setup',     label: '模試モード',     Icon: IconClock   },
  { path: '/questions',      label: '問題一覧',       Icon: IconList    },
  { path: '/stats',          label: '統計・分析',     Icon: IconChart   },
  { path: '/release-notes',  label: 'リリースノート', Icon: IconBell,   bottom: true },
  { path: '/architecture',   label: 'システム構成',   Icon: IconInfo,   bottom: true },
];

const AI_LINKS = [
  { 
    label: 'ChatGPT', 
    url: 'https://chatgpt.com/',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
        <path d="M12 12 21.1 5"></path>
        <path d="M12 12 2.9 5"></path>
      </svg>
    )
  },
  { 
    label: 'Gemini',  
    url: 'https://gemini.google.com/',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
      </svg>
    )
  },
  { 
    label: 'Claude',  
    url: 'https://claude.ai/',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    )
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(() => localStorage.getItem('sidebarOpen') !== 'false');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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

  const navItems = NAV_ITEMS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>

      {/* ── ヘッダー（グローバルナビ） ── */}
      <header style={{
        height: 48, minHeight: 48, background: '#232f3e',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        gap: 12, zIndex: 200, flexShrink: 0,
      }}>
        {/* サービス名 */}
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexShrink: 0, padding: '0 4px' }}>
          <img
            src={isMobile ? '/logo_sherpa_image_t.png' : '/logo_sherpa_text+image_t.png'}
            alt="AWS Waypoint Sherpa"
            style={{ height: isMobile ? 32 : 36, width: 'auto', display: 'block' }}
          />
        </div>

        {/* 検索バー */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: isMobile ? 'none' : 480, minWidth: 0, marginLeft: 8 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isMobile ? '検索' : 'サービス、機能、ドキュメントなどを検索'}
              style={{
                width: '100%', padding: '5px 10px 5px 30px',
                borderRadius: 3, border: '1px solid #3a4a5a',
                background: '#1a2433', color: '#d5dbdb',
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.border = '1px solid #879596'; e.currentTarget.style.background = '#1e2a3a'; }}
              onBlur={e => { e.currentTarget.style.border = '1px solid #3a4a5a'; e.currentTarget.style.background = '#1a2433'; }}
            />
            <span style={{ position: 'absolute', left: 8, color: '#879596', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <IconSearch />
            </span>
          </div>
        </form>

        {/* AI リンク（デスクトップのみ） */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingLeft: 10, borderLeft: '1px solid #3a4a5a' }}>
            {AI_LINKS.map(ai => (
              <a key={ai.label} href={ai.url} target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 9999,
                  textDecoration: 'none', fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 700,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.35)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.65)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.35)';
                }}
                title={`${ai.label} を別タブで開く`}
              >
                <span style={{ color: 'rgba(255,255,255,0.7)', display: 'flex' }}>{ai.icon}</span>
                {ai.label}
                <svg viewBox="0 0 16 16" width="9" height="9" fill="rgba(255,255,255,0.45)" style={{ marginLeft: 1 }}>
                  <path d="M12.5 11.5v-3h1v4a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1h4v1h-4v10h10zm-6.15-5.15L11.8 1.8 10 1.8v-1h5v5h-1l-.01-1.8-5.44 5.45-.7-.7z" />
                </svg>
              </a>
            ))}
          </div>
        )}

        {/* ユーザー情報 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {user ? (
            <>
              {!isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, borderLeft: '1px solid #3a4a5a', paddingLeft: 12 }}>
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
            </>
          ) : (
            <button onClick={() => navigate('/login')} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.35)',
              color: 'rgba(255,255,255,0.85)', fontSize: 12, padding: '4px 12px',
              borderRadius: 9999, cursor: 'pointer', fontWeight: 700,
            }}>
              ログイン
            </button>
          )}
        </div>
      </header>

      {/* ── サブバー（ハンバーガー＋パンくず） ── */}
      <div style={{
        height: 36, minHeight: 36, background: 'white',
        display: 'flex', alignItems: 'center', padding: '0 8px',
        zIndex: 199, flexShrink: 0, borderBottom: '1px solid #eaeded',
      }}>
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#545b64', fontSize: 16, lineHeight: 1, padding: '2px 8px',
          display: 'flex', alignItems: 'center', borderRadius: 3,
          transition: 'color 0.1s', flexShrink: 0,
        }}
          onMouseEnter={e => e.currentTarget.style.color = '#16191f'}
          onMouseLeave={e => e.currentTarget.style.color = '#545b64'}
          title={open ? 'メニューを閉じる' : 'メニューを開く'}
        >
          &#9776;
        </button>
        {BREADCRUMBS[location.pathname] && (
          <Breadcrumb
            items={BREADCRUMBS[location.pathname]}
            style={{ marginBottom: 0, fontSize: 13 }}
          />
        )}
      </div>

      {/* ── ボディ（サイドバー + コンテンツ） ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* モバイル: オーバーレイ背景 */}
        {isMobile && open && (
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, top: 84, background: 'rgba(0,0,0,0.5)', zIndex: 150,
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
            position: 'fixed', top: 84, left: 0,
            height: 'calc(100vh - 84px)', zIndex: 160,
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
                    borderLeft: `3px solid ${active ? '#008c8c' : 'transparent'}`,
                    cursor: 'pointer',
                    color: active ? '#008c8c' : '#545b64',
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
                      borderLeft: `3px solid ${active ? '#008c8c' : 'transparent'}`,
                      cursor: 'pointer',
                      color: active ? '#008c8c' : '#879596',
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
              <div style={{ borderTop: '1px solid #eaeded', padding: '16px 20px', background: '#fbfbfb' }}>
                <div style={{ fontSize: 12, color: '#545b64', marginBottom: 12, fontWeight: 700 }}>AI アシスタント</div>
                {AI_LINKS.map(ai => (
                  <a key={ai.label} href={ai.url} target="_blank" rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '10px 12px', marginBottom: 10, borderRadius: 4,
                      textDecoration: 'none', fontSize: 14, color: '#16191f',
                      border: '1px solid #eaeded', background: 'white',
                      fontWeight: 700, boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { 
                      (e.currentTarget as HTMLElement).style.borderColor = '#008c8c';
                      (e.currentTarget as HTMLElement).style.background = '#e0f2f2';
                    }}
                    onMouseLeave={e => { 
                      (e.currentTarget as HTMLElement).style.borderColor = '#eaeded';
                      (e.currentTarget as HTMLElement).style.background = 'white';
                    }}
                  >
                    <span style={{ color: '#008c8c', display: 'flex', marginRight: 10 }}>{ai.icon}</span>
                    <span style={{ flex: 1 }}>{ai.label}</span>
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="#879596">
                      <path d="M12.5 11.5v-3h1v4a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1h4v1h-4v10h10zm-6.15-5.15L11.8 1.8 10 1.8v-1h5v5h-1l-.01-1.8-5.44 5.45-.7-.7z" />
                    </svg>
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
