import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { API_ENDPOINT } from '../constants';
import Breadcrumb from './Breadcrumb';
import Button from './ui/Button';
import {
  IconHome, IconPencil, IconClock, IconList,
  IconSearch, IconUser, IconChart, IconInfo,
  IconBell, IconMenu, IconClose, IconChevronLeft, IconMail
} from './Icons';

type BreadcrumbItem = { label: string; path?: string };

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

  const breadcrumbs: Record<string, BreadcrumbItem[]> = {
    '/questions':        [{ label: t('nav.home'), path: '/' }, { label: t('nav.questions') }],
    '/exercise/setup':   [{ label: t('nav.home'), path: '/' }, { label: t('exerciseSetup.title') }],
    '/exercise/session': [{ label: t('nav.home'), path: '/' }, { label: t('exerciseSetup.title'), path: '/exercise/setup' }, { label: t('nav.exerciseSession') }],
    '/exam/setup':       [{ label: t('nav.home'), path: '/' }, { label: t('examSetup.title') }],
    '/exam/session':     [{ label: t('nav.home'), path: '/' }, { label: t('examSetup.title'), path: '/exam/setup' }, { label: t('nav.examSession') }],
    '/result':           [{ label: t('nav.home'), path: '/' }, { label: t('nav.result') }],
    '/stats':            [{ label: t('nav.home'), path: '/' }, { label: t('stats.title') }],
    '/architecture':     [{ label: t('nav.home'), path: '/' }, { label: t('nav.architecture') }],
    '/release-notes':    [{ label: t('nav.home'), path: '/' }, { label: t('nav.releaseNotes') }],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'inherit' }}>

      {/* ── 連絡先モーダル ── */}
      {showContact && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowContact(false); } }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '28px 32px', width: '100%', maxWidth: 480, boxShadow: 'var(--box-shadow-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>{t('contact.title')}</h3>
              <button onClick={() => setShowContact(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px' }}>✕</button>
            </div>
            {contactDone ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 'var(--spacing-md)' }}>✓</div>
                <p style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 'var(--font-size-md)', margin: '0 0 var(--spacing-sm)' }}>{t('contact.sent')}</p>
                <p style={{ color: 'var(--color-text-sub)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-lg)' }}>{t('contact.thankYou')}</p>
                <Button onClick={() => setShowContact(false)} size="md">
                  {t('contact.close')}
                </Button>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: 'var(--spacing-sm) var(--spacing-md)', lineHeight: 1.6 }}>
                  {t('contact.anonymous')}
                </p>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>{t('contact.subject')}</div>
                  <input
                    value={contactSubject}
                    onChange={e => setContactSubject(e.target.value)}
                    placeholder={t('contact.subjectPlaceholder')}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>{t('contact.message')} <span style={{ color: 'var(--color-danger)' }}>*</span></div>
                  <textarea
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    placeholder={t('contact.messagePlaceholder')}
                    rows={5}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <Button
                    onClick={handleContactSend}
                    disabled={contactSending || !contactMessage.trim()}
                    variant="accent"
                    style={{ flex: 1 }}
                  >
                    {contactSending ? t('contact.sending') : t('contact.send')}
                  </Button>
                  <Button onClick={() => setShowContact(false)} variant="outline">
                    {t('contact.cancel')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ヘッダー（グローバルナビ） ── */}
      <header style={{
        height: 56, minHeight: 56, background: 'var(--color-secondary)',
        display: 'flex', alignItems: 'center', padding: '0 var(--spacing-lg)',
        gap: 'var(--spacing-md)', zIndex: 200, flexShrink: 0,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: isMobile ? 'none' : 480, minWidth: 0, marginLeft: 'var(--spacing-sm)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isMobile ? t('nav.searchShort') : t('nav.searchPlaceholder')}
              style={{
                width: '100%', padding: '6px 12px 6px 34px',
                borderRadius: 'var(--border-radius-sm)', border: '1px solid #3a4a5a',
                background: '#1a2433', color: '#d5dbdb',
                fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box',
                transition: 'all 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.border = '1px solid var(--color-text-light)'; e.currentTarget.style.background = '#1e2a3a'; }}
              onBlur={e => { e.currentTarget.style.border = '1px solid #3a4a5a'; e.currentTarget.style.background = '#1a2433'; }}
            />
            <span style={{ position: 'absolute', left: 10, color: 'var(--color-text-light)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <IconSearch />
            </span>
          </div>
        </form>

        {/* AI リンク（デスクトップのみ） */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexShrink: 0, paddingLeft: 'var(--spacing-md)', borderLeft: '1px solid #3a4a5a' }}>
            {AI_LINKS.map(ai => (
              <a key={ai.label} href={ai.url} target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 'var(--border-radius-full)',
                  textDecoration: 'none', fontSize: 'var(--font-size-xs)', color: 'rgba(255,255,255,0.85)', fontWeight: 700,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.35)',
                  transition: 'all 0.2s ease',
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
              </a>
            ))}
          </div>
        )}

        {/* 言語トグル + ユーザー情報 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexShrink: 0 }}>
          {/* 言語切替 */}
          <div style={{ display: 'flex', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0 }}>
            {(['ja', 'en'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  padding: '4px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: lang === l ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: lang === l ? 'white' : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.2s',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {user ? (
            <>
              {!isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid #3a4a5a', paddingLeft: 'var(--spacing-md)' }}>
                  <span style={{ color: 'var(--color-text-light)', display: 'flex', alignItems: 'center' }}><IconUser /></span>
                  <span style={{ color: '#d5dbdb', fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>{user.email?.split('@')[0]}</span>
                </div>
              )}
              <button onClick={handleSignOut} style={{
                background: 'none', border: 'none',
                color: '#d5dbdb', fontSize: 'var(--font-size-sm)', padding: '4px 0', cursor: 'pointer', fontWeight: 700,
              }}>
                {isMobile ? t('nav.logoutShort') : t('nav.logout')}
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/login')} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.35)',
              color: 'rgba(255,255,255,0.85)', fontSize: 'var(--font-size-sm)', padding: '5px 14px',
              borderRadius: 'var(--border-radius-full)', cursor: 'pointer', fontWeight: 700,
            }}>
              {t('nav.login')}
            </button>
          )}
        </div>
      </header>

      {/* ── サブバー（ハンバーガー＋パンくず） ── */}
      <div style={{
        height: 40, minHeight: 40, background: 'var(--color-bg-white)',
        display: 'flex', alignItems: 'center', padding: '0 var(--spacing-sm)',
        zIndex: 199, flexShrink: 0, borderBottom: '1px solid var(--color-border)',
      }}>
        <button onClick={toggle} style={{
          background: open ? 'var(--color-bg-main)' : 'none', border: 'none', cursor: 'pointer',
          color: open ? 'var(--color-text-main)' : 'var(--color-text-sub)', fontSize: 16, lineHeight: 1, padding: '6px 10px',
          display: 'flex', alignItems: 'center', borderRadius: 'var(--border-radius-sm)',
          transition: 'all 0.2s', flexShrink: 0,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-main)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = open ? 'var(--color-bg-main)' : 'none'; e.currentTarget.style.color = open ? 'var(--color-text-main)' : 'var(--color-text-sub)'; }}
          title={open ? t('nav.closeMenu') : t('nav.openMenu')}
        >
          {open ? <IconClose /> : <IconMenu />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {breadcrumbs[location.pathname] && (
            <Breadcrumb
              items={breadcrumbs[location.pathname]}
              style={{ marginBottom: 0, fontSize: 'var(--font-size-sm)' }}
            />
          )}
        </div>
        {targetExam && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingRight: 'var(--spacing-md)' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>{t('nav.goal')}</span>
            <span style={{ background: 'var(--color-secondary)', color: 'white', fontSize: 'var(--font-size-xs)', padding: '2px 10px', borderRadius: 'var(--border-radius-full)', fontWeight: 700 }}>
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
            position: 'fixed', inset: 0, top: 96, background: 'rgba(0,0,0,0.5)', zIndex: 150,
          }} />
        )}

        {/* サイドバー */}
        <nav style={{
          width: open ? 'var(--sidebar-width)' : 0,
          minWidth: open ? 'var(--sidebar-width)' : 0,
          background: 'var(--color-bg-white)',
          borderRight: open ? '1px solid var(--color-border)' : 'none',
          overflow: 'hidden',
          transition: 'all 0.2s ease-out',
          display: 'flex', flexDirection: 'column',
          ...(isMobile ? {
            position: 'fixed', top: 96, left: 0,
            height: 'calc(100vh - 96px)', zIndex: 160,
            boxShadow: open ? '2px 0 8px rgba(0,0,0,0.15)' : 'none',
          } : {}),
        }}>
          <div style={{ width: 'var(--sidebar-width)', paddingTop: 'var(--spacing-sm)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {!isMobile && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 var(--spacing-sm) var(--spacing-xs)' }}>
                <button onClick={toggle} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-light)', padding: '4px 6px', borderRadius: 'var(--border-radius-sm)',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 'var(--font-size-xs)', transition: 'all 0.2s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-sub)'; e.currentTarget.style.background = 'var(--color-bg-main)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-light)'; e.currentTarget.style.background = 'none'; }}
                  title={t('nav.closeMenu')}
                >
                  <IconChevronLeft />
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
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 24px',
                    background: active ? 'var(--color-primary-light)' : 'none',
                    border: 'none',
                    borderLeft: `4px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
                    cursor: 'pointer',
                    color: active ? 'var(--color-primary)' : 'var(--color-text-sub)',
                    fontSize: 'var(--font-size-base)',
                    fontWeight: active ? 700 : 400,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-main)'; }}
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
            <div style={{ marginTop: 'auto', paddingBottom: 'var(--spacing-md)' }}>
              {navItems.filter(item => (item as any).bottom).map(({ path, labelKey, Icon }) => {
                const active = isActive(path);
                return (
                  <button
                    key={path}
                    onClick={() => { navigate(path); if (isMobile) setOpen(false); }}
                    style={{
                      width: '100%', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 24px',
                      background: active ? 'var(--color-primary-light)' : 'none',
                      border: 'none',
                      borderTop: '1px solid var(--color-border)',
                      borderLeft: `4px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
                      cursor: 'pointer',
                      color: active ? 'var(--color-primary)' : 'var(--color-text-light)',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: active ? 700 : 400,
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-main)'; }}
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
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 24px',
                  background: 'none', border: 'none',
                  borderTop: '1px solid var(--color-border)',
                  borderLeft: '4px solid transparent',
                  cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontWeight: 400,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-main)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', opacity: 0.6 }}><IconMail /></span>
                <span>{t('contact.sidebarLabel')}</span>
              </button>
            </div>

            {/* モバイルのみ: AI リンクをサイドバー下部に表示 */}
            {isMobile && (
              <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--spacing-lg) 24px', background: '#fbfbfb' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-md)', fontWeight: 700 }}>{t('nav.aiAssistant')}</div>
                {AI_LINKS.map(ai => (
                  <a key={ai.label} href={ai.url} target="_blank" rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '12px 16px', marginBottom: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-md)',
                      textDecoration: 'none', fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)',
                      border: '1px solid var(--color-border)', background: 'var(--color-bg-white)',
                      fontWeight: 700, boxShadow: 'var(--box-shadow-sm)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => { 
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)';
                      (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-light)';
                    }}
                    onMouseLeave={e => { 
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)';
                      (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-white)';
                    }}
                  >
                    <span style={{ color: 'var(--color-primary)', display: 'flex', marginRight: 12 }}>{ai.icon}</span>
                    <span style={{ flex: 1 }}>{ai.label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* メインコンテンツ */}
        <main style={{
          flex: 1, overflow: 'auto',
          background: 'var(--color-bg-main)',
          width: isMobile ? '100%' : undefined,
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
