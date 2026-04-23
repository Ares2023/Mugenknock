import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { API_ENDPOINT } from '../constants';
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
const IconMenu = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="4" x2="14" y2="4"/>
    <line x1="2" y1="8" x2="14" y2="8"/>
    <line x1="2" y1="12" x2="14" y2="12"/>
  </svg>
);
const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="3" x2="13" y2="13"/>
    <line x1="13" y1="3" x2="3" y2="13"/>
  </svg>
);
const IconChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="10 3 5 8 10 13"/>
  </svg>
);
const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5"/>
    <polyline points="1,3 8,9.5 15,3"/>
  </svg>
);

const NAV_KEYS = [
  { path: '/',               labelKey: 'nav.home',         Icon: IconHome    },
  { path: '/exercise/setup', labelKey: 'nav.exercise',     Icon: IconPencil  },
  { path: '/exam/setup',     labelKey: 'nav.exam',         Icon: IconClock   },
  { path: '/stats',          labelKey: 'nav.stats',        Icon: IconChart   },
  { path: '/questions',      labelKey: 'nav.questions',    Icon: IconList,   bottom: true },
  { path: '/release-notes',  labelKey: 'nav.releaseNotes', Icon: IconBell,   bottom: true },
  { path: '/architecture',   labelKey: 'nav.architecture', Icon: IconInfo,   bottom: true },
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
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(() => localStorage.getItem('sidebarOpen') !== 'false');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem('targetExam'));
  const [showContact, setShowContact] = useState(false);
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactDone, setContactDone] = useState(false);

  useEffect(() => {
    setTargetExam(localStorage.getItem('targetExam'));
  }, [location.pathname]);

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

  const handleContactSend = async () => {
    if (!contactMessage.trim()) return;
    setContactSending(true);
    try {
      await fetch(`${API_ENDPOINT}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: contactSubject.trim(),
          message: contactMessage.trim(),
        }),
      });
      setContactDone(true);
      setContactSubject('');
      setContactMessage('');
    } catch (err) {
      console.error(err);
    } finally {
      setContactSending(false);
    }
  };

  const openContact = () => {
    setContactDone(false);
    setContactSubject('');
    setContactMessage('');
    setShowContact(true);
    if (isMobile) setOpen(false);
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const navItems = NAV_KEYS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>

      {/* ── 連絡先モーダル ── */}
      {showContact && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowContact(false); } }}
        >
          <div style={{ background: 'white', borderRadius: 8, padding: '28px 32px', width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#16191f' }}>管理者に連絡</h3>
              <button onClick={() => setShowContact(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#545b64', padding: '4px 8px' }}>✕</button>
            </div>
            {contactDone ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                <p style={{ color: '#037f0c', fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>送信しました</p>
                <p style={{ color: '#545b64', fontSize: 13, margin: '0 0 20px' }}>お問い合わせありがとうございます。</p>
                <button onClick={() => setShowContact(false)} style={{ padding: '8px 24px', background: '#008c8c', color: 'white', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                  閉じる
                </button>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: '#879596', background: '#f2f3f3', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
                  メッセージは匿名で送信されます。送信者の情報は管理者に通知されません。
                </p>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 6 }}>件名（任意）</div>
                  <input
                    value={contactSubject}
                    onChange={e => setContactSubject(e.target.value)}
                    placeholder="例：機能の要望、不具合の報告"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                    onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 6 }}>メッセージ <span style={{ color: '#d13212' }}>*</span></div>
                  <textarea
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    placeholder="ご意見・ご要望・不具合などをお気軽にどうぞ"
                    rows={5}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }}
                    onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                    onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleContactSend}
                    disabled={contactSending || !contactMessage.trim()}
                    style={{
                      padding: '8px 24px', borderRadius: 9999, border: '1px solid transparent', fontWeight: 700, fontSize: 14, cursor: contactSending || !contactMessage.trim() ? 'default' : 'pointer',
                      background: contactSending || !contactMessage.trim() ? '#eaeded' : '#ff9900',
                      color: contactSending || !contactMessage.trim() ? '#aab7b8' : '#16191f',
                    }}
                  >
                    {contactSending ? '送信中...' : '送信する'}
                  </button>
                  <button onClick={() => setShowContact(false)} style={{ padding: '8px 20px', border: '1px solid #545b64', borderRadius: 9999, cursor: 'pointer', background: 'white', fontWeight: 700, fontSize: 14, color: '#545b64' }}>
                    キャンセル
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ヘッダー（グローバルナビ） ── */}
      <header style={{
        height: 48, minHeight: 48, background: '#232f3e',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        gap: 12, zIndex: 200, flexShrink: 0,
      }}>
        {/* サービス名 */}
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexShrink: 0, padding: '0 4px' }}>
          <img
            src={isMobile ? '/logo_sherpa_image_t.png' : '/logo_sherpa_txt+image_t.png'}
            alt="Sherpa"
            style={{ height: isMobile ? 32 : 36, width: 'auto', display: 'block' }}
          />
        </div>

        {/* 検索バー */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: isMobile ? 'none' : 480, minWidth: 0, marginLeft: 8 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isMobile ? t('nav.searchShort') : t('nav.searchPlaceholder')}
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

        {/* 言語トグル + ユーザー情報 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* 言語切替 */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0 }}>
            {(['ja', 'en'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: lang === l ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: lang === l ? 'white' : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.1s',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

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
                {isMobile ? t('nav.logoutShort') : t('nav.logout')}
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/login')} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.35)',
              color: 'rgba(255,255,255,0.85)', fontSize: 12, padding: '4px 12px',
              borderRadius: 9999, cursor: 'pointer', fontWeight: 700,
            }}>
              {t('nav.login')}
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
          background: open ? '#f2f3f3' : 'none', border: 'none', cursor: 'pointer',
          color: open ? '#16191f' : '#545b64', fontSize: 16, lineHeight: 1, padding: '4px 8px',
          display: 'flex', alignItems: 'center', borderRadius: 3,
          transition: 'background 0.1s, color 0.1s', flexShrink: 0,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = '#eaeded'; e.currentTarget.style.color = '#16191f'; }}
          onMouseLeave={e => { e.currentTarget.style.background = open ? '#f2f3f3' : 'none'; e.currentTarget.style.color = open ? '#16191f' : '#545b64'; }}
          title={open ? t('nav.closeMenu') : t('nav.openMenu')}
        >
          {open ? <IconClose /> : <IconMenu />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {BREADCRUMBS[location.pathname] && (
            <Breadcrumb
              items={BREADCRUMBS[location.pathname]}
              style={{ marginBottom: 0, fontSize: 13 }}
            />
          )}
        </div>
        {targetExam && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, paddingRight: 8 }}>
            <span style={{ fontSize: 11, color: '#879596' }}>{t('nav.goal')}</span>
            <span style={{ background: '#232f3e', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              {targetExam}
            </span>
          </div>
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
            {!isMobile && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 8px 4px' }}>
                <button onClick={toggle} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#879596', padding: '4px 6px', borderRadius: 3,
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, transition: 'color 0.1s, background 0.1s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#545b64'; e.currentTarget.style.background = '#f2f3f3'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#879596'; e.currentTarget.style.background = 'none'; }}
                  title={t('nav.closeMenu')}
                >
                  <IconChevronLeft />
                  <span>{t('nav.close')}</span>
                </button>
              </div>
            )}
            {navItems.filter(item => !(item as any).bottom).map(({ path, labelKey, Icon }) => {
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
                  <span>{t(labelKey)}</span>
                </button>
              );
            })}

            {/* 下部固定ナビ（システム構成など） */}
            <div style={{ marginTop: 'auto' }}>
              {navItems.filter(item => (item as any).bottom).map(({ path, labelKey, Icon }) => {
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
                    <span>{t(labelKey)}</span>
                  </button>
                );
              })}
              {/* 連絡先ボタン */}
              <button
                onClick={openContact}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 20px',
                  background: 'none', border: 'none',
                  borderTop: '1px solid #eaeded',
                  borderLeft: '3px solid transparent',
                  cursor: 'pointer', color: '#879596', fontSize: 13, fontWeight: 400,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f2f3f3'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', opacity: 0.6 }}><IconMail /></span>
                <span>連絡先</span>
              </button>
            </div>

            {/* モバイルのみ: AI リンクをサイドバー下部に表示 */}
            {isMobile && (
              <div style={{ borderTop: '1px solid #eaeded', padding: '16px 20px', background: '#fbfbfb' }}>
                <div style={{ fontSize: 12, color: '#545b64', marginBottom: 12, fontWeight: 700 }}>{t('nav.aiAssistant')}</div>
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
