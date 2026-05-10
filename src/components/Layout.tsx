import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { API_ENDPOINT, EXAM_CONFIGS, EXAM_DOMAINS, DOMAIN_NAME_EN } from '../constants';
import Breadcrumb from './Breadcrumb';
import Button from './ui/Button';
import {
  IconHome, IconPencil, IconClock, IconList,
  IconUser, IconChart, IconInfo, IconUserCircle,
  IconFire, IconMenu, IconClose, IconChevronLeft, IconMail, IconTrendingUp,
  IconSparkles
} from './Icons';

type BreadcrumbItem = { label: string; path?: string };

const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const IconMore = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" stroke="none">
    <circle cx="4" cy="10" r="1.8"/>
    <circle cx="10" cy="10" r="1.8"/>
    <circle cx="16" cy="10" r="1.8"/>
  </svg>
);

const NAV_KEYS = [
  { path: '/',               labelKey: 'nav.home',         Icon: IconHome         },
  { path: '/exercise/setup', labelKey: 'nav.exercise',     Icon: IconPencil       },
  { path: '/exam/setup',     labelKey: 'nav.exam',         Icon: IconClock        },
  { path: '/stats',          labelKey: 'nav.stats',        Icon: IconChart        },
  { path: '/questions',      labelKey: 'nav.questions',    Icon: IconList,        bottom: true },
  { path: '/growth',         labelKey: 'nav.growth',       Icon: IconSparkles,       bottom: true },
  { path: '/release-notes',  labelKey: 'nav.releaseNotes', Icon: IconFire,        bottom: true },
  { path: '/architecture',   labelKey: 'nav.architecture', Icon: IconInfo,        bottom: true },
];

const BOTTOM_TABS = [
  { path: '/',               Icon: IconHome,    ja: 'ホーム', en: 'Home'     },
  { path: '/exercise/setup', Icon: IconPencil,  ja: '演習',   en: 'Practice' },
  { path: '/exam/setup',     Icon: IconClock,   ja: '模試',   en: 'Exam'     },
  { path: '/stats',          Icon: IconChart,   ja: '統計',   en: 'Stats'    },
];

const OTHERS_ITEMS = [
  { path: '/questions',     Icon: IconList,       labelKey: 'nav.questions'    },
  { path: '/growth',        Icon: IconSparkles,      labelKey: 'nav.growth'       },
  { path: '/release-notes', Icon: IconFire,       labelKey: 'nav.releaseNotes' },
  { path: '/architecture',  Icon: IconInfo,       labelKey: 'nav.architecture' },
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
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [open, setOpen] = useState(() => {
    if (window.innerWidth < 768) return false;
    return localStorage.getItem('sidebarOpen') !== 'false';
  });
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem('targetExam'));
  const [showContact, setShowContact] = useState(false);
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactDone, setContactDone] = useState(false);
  const [contactError, setContactError] = useState(false);

  // デスクトップ: アカウントドロップダウン
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  const [othersOpen, setOthersOpen] = useState(false);

  useEffect(() => {
    setTargetExam(localStorage.getItem('targetExam'));
  }, [location.pathname]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // ルート変更でドロワー/シートを閉じる
  useEffect(() => {
    setOthersOpen(false);
    setAccountDropdownOpen(false);
    if (isMobile) setOpen(false);
  }, [location.pathname]);

  // デスクトップドロップダウン: 外クリックで閉じる
  useEffect(() => {
    if (!accountDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [accountDropdownOpen]);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);


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
    setContactError(false);
    try {
      const res = await fetch(`${API_ENDPOINT}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.userId ?? 'anonymous',
          subject: contactSubject.trim(),
          message: contactMessage.trim(),
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setContactDone(true);
      setContactSubject('');
      setContactMessage('');
    } catch (err) {
      console.error(err);
      setContactError(true);
    } finally {
      setContactSending(false);
    }
  };

  const openContact = () => {
    setContactDone(false);
    setContactError(false);
    setContactSubject('');
    setContactMessage('');
    setShowContact(true);
    if (isMobile) { setOpen(false); setOthersOpen(false); }
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const isOthersActive = OTHERS_ITEMS.some(item => isActive(item.path));

  const navItems = NAV_KEYS;

  const breadcrumbs: Record<string, BreadcrumbItem[]> = {
    '/questions':        [{ label: t('nav.home'), path: '/' }, { label: t('nav.questions') }],
    '/growth':           [{ label: t('nav.home'), path: '/' }, { label: t('nav.growth') }],
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
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: isMobile ? '20px 18px' : '28px 32px', width: '100%', maxWidth: 480, boxShadow: 'var(--box-shadow-md)', maxHeight: '90vh', overflowY: 'auto' }}>
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
                {contactError && (
                  <p style={{ margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>
                    {lang === 'ja' ? '送信に失敗しました。しばらく経ってから再試行してください。' : 'Failed to send. Please try again later.'}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <Button
                    onClick={handleContactSend}
                    disabled={contactSending || !contactMessage.trim()}
                    variant="primary"
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


      {/* ── モバイル: その他シート ── */}
      {isMobile && othersOpen && (
        <>
          <div
            onClick={() => setOthersOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 399 }}
          />
          <div style={{
            position: 'fixed', bottom: 56, left: 0, right: 0,
            background: 'var(--color-bg-white)',
            borderRadius: '16px 16px 0 0',
            zIndex: 400,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            paddingBottom: 8,
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '12px auto 8px' }} />
            {OTHERS_ITEMS.map(({ path, Icon, labelKey }) => {
              const active = isActive(path);
              return (
                <button
                  key={path}
                  onClick={() => { navigate(path); setOthersOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 24px', border: 'none', background: 'none',
                    cursor: 'pointer', fontSize: 'var(--font-size-base)',
                    color: active ? 'var(--color-primary)' : 'var(--color-text-main)',
                    fontWeight: active ? 700 : 400, textAlign: 'left',
                  }}
                >
                  <span style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}><Icon /></span>
                  <span>{t(labelKey)}</span>
                </button>
              );
            })}
            <button
              onClick={() => { openContact(); setOthersOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 24px', border: 'none',
                borderTop: '1px solid var(--color-border)',
                background: 'none', cursor: 'pointer',
                fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}><IconMail /></span>
              <span>{t('contact.sidebarLabel')}</span>
            </button>
          </div>
        </>
      )}

      {/* ── ヘッダー ── */}
      <header style={{
        height: 56, minHeight: 56, background: 'var(--color-secondary)',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 12px 0 8px' : '0 var(--spacing-lg)',
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

        {/* アカウントボタン（モバイル・デスクトップ共通） */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <div ref={accountDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setAccountDropdownOpen(prev => !prev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: isMobile ? '50%' : 'var(--border-radius-md)',
                cursor: 'pointer', color: 'white',
                width: isMobile ? 36 : 'auto',
                height: isMobile ? 36 : 'auto',
                padding: isMobile ? '0' : '5px 10px',
                justifyContent: 'center',
                fontSize: 'var(--font-size-sm)', fontWeight: 600,
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            >
              {isMobile ? <IconUser /> : (
                user
                  ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{user.email?.split('@')[0]}</span>
                  : <IconUser />
              )}
            </button>

            {accountDropdownOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: 'var(--color-bg-white)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--border-radius-lg)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                minWidth: 240,
                zIndex: 500,
                overflow: 'hidden',
              }}>
                {/* ユーザー情報（ログイン時） */}
                {user && (
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-main)' }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 2 }}>
                      {user.email?.split('@')[0]}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', wordBreak: 'break-all' }}>
                      {user.email}
                    </div>
                  </div>
                )}

                {/* 言語・外観設定 */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
                      {lang === 'ja' ? '言語' : 'Language'}
                    </span>
                    <div style={{ display: 'flex', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                      {(['ja', 'en'] as const).map(l => (
                        <button key={l} onClick={() => setLang(l)} style={{
                          padding: '3px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', border: 'none',
                          background: lang === l ? 'var(--color-primary)' : 'transparent',
                          color: lang === l ? 'white' : 'var(--color-text-sub)',
                          transition: 'all 0.15s',
                        }}>{l.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
                      {lang === 'ja' ? '外観' : 'Appearance'}
                    </span>
                    <div style={{ display: 'flex', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                      {(['light', 'dark'] as const).map(th => (
                        <button key={th} onClick={() => { if (theme !== th) toggleTheme(); }} style={{
                          padding: '3px 8px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', border: 'none',
                          background: theme === th ? 'var(--color-primary)' : 'transparent',
                          color: theme === th ? 'white' : 'var(--color-text-sub)',
                          transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          {th === 'light' ? <IconSun /> : <IconMoon />}
                          {th === 'light' ? (lang === 'ja' ? 'ライト' : 'Light') : (lang === 'ja' ? 'ダーク' : 'Dark')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ログイン時: アカウント管理・ログアウト */}
                {user ? (
                  <>
                    <button
                      onClick={() => { setAccountDropdownOpen(false); navigate('/account'); }}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-main)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <span style={{ color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center' }}><IconUserCircle /></span>
                      <span>{lang === 'ja' ? 'アカウント管理' : 'Account Settings'}</span>
                    </button>
                    <div style={{ height: 1, background: 'var(--color-border)' }} />
                    <button
                      onClick={() => { setAccountDropdownOpen(false); handleSignOut(); }}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)', fontWeight: 700, transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-main)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {t('nav.logout')}
                    </button>
                  </>
                ) : (
                  /* 未ログイン時: ログインボタン */
                  <button
                    onClick={() => { setAccountDropdownOpen(false); navigate('/login'); }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', fontWeight: 700, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-main)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    {t('nav.login')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── サブバー（ハンバーガー＋パンくず） ── */}
      <div style={{
        height: 40, minHeight: 40, background: 'var(--color-bg-white)',
        display: 'flex', alignItems: 'center', padding: '0 var(--spacing-sm)',
        gap: 'var(--spacing-sm)',
        zIndex: 199, flexShrink: 0, borderBottom: '1px solid var(--color-border)',
      }}>
        {/* デスクトップのみ: ハンバーガー */}
        {!isMobile && (
          <button onClick={toggle} style={{
            background: open ? 'var(--color-bg-main)' : 'none', border: 'none', cursor: 'pointer',
            color: open ? 'var(--color-text-main)' : 'var(--color-text-sub)', fontSize: 16, lineHeight: 1,
            padding: '6px 10px',
            display: 'flex', alignItems: 'center', borderRadius: 'var(--border-radius-sm)',
            transition: 'all 0.2s', flexShrink: 0,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-main)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = open ? 'var(--color-bg-main)' : 'none'; e.currentTarget.style.color = open ? 'var(--color-text-main)' : 'var(--color-text-sub)'; }}
            title={open ? t('nav.closeMenu') : t('nav.openMenu')}
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {breadcrumbs[location.pathname] && (
            <Breadcrumb
              items={breadcrumbs[location.pathname]}
              style={{ marginBottom: 0, fontSize: 'var(--font-size-sm)' }}
            />
          )}
        </div>
        {targetExam && (
          <div style={{ flexShrink: 0, paddingRight: 'var(--spacing-xs)' }}>
            <span style={{ background: 'var(--color-secondary)', color: 'white', fontSize: 'var(--font-size-xs)', padding: '2px 10px', borderRadius: 'var(--border-radius-full)', fontWeight: 700 }}>
              {targetExam}
            </span>
          </div>
        )}
      </div>

      {/* ── ボディ ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* デスクトップ: サイドバーオーバーレイ（モバイルでは使わない） */}
        {!isMobile && open === false && false /* no overlay needed on desktop */ && (
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, top: 96, background: 'rgba(0,0,0,0.5)', zIndex: 150,
          }} />
        )}

        {/* デスクトップのみ: サイドバー */}
        {!isMobile && (
          <nav style={{
            width: open ? 'var(--sidebar-width)' : 0,
            minWidth: open ? 'var(--sidebar-width)' : 0,
            background: 'var(--color-bg-white)',
            borderRight: open ? '1px solid var(--color-border)' : 'none',
            overflow: 'hidden',
            transition: 'all 0.2s ease-out',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ width: 'var(--sidebar-width)', paddingTop: 'var(--spacing-sm)', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <button onClick={toggle} style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-light)', padding: '8px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                fontSize: 'var(--font-size-xs)', transition: 'all 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-sub)'; e.currentTarget.style.background = 'var(--color-bg-main)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-light)'; e.currentTarget.style.background = 'none'; }}
                title={t('nav.closeMenu')}
              >
                <IconChevronLeft />
              </button>
              {navItems.filter(item => !(item as any).bottom).map(({ path, labelKey, Icon }) => {
                const active = isActive(path);
                return (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
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

              <div style={{ marginTop: 'auto', paddingBottom: 'var(--spacing-md)' }}>
                {navItems.filter(item => (item as any).bottom).map(({ path, labelKey, Icon }) => {
                  const active = isActive(path);
                  return (
                    <button
                      key={path}
                      onClick={() => navigate(path)}
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
                    whiteSpace: 'nowrap', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-main)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', opacity: 0.6 }}><IconMail /></span>
                  <span>{t('contact.sidebarLabel')}</span>
                </button>
              </div>
            </div>
          </nav>
        )}

        {/* メインコンテンツ */}
        <main ref={mainRef} style={{
          flex: 1, overflow: 'auto',
          background: 'var(--color-bg-main)',
          width: '100%',
          WebkitOverflowScrolling: 'touch',
          minWidth: 0,
          paddingBottom: isMobile ? 120 : 0,
        }}>
          {children}
        </main>
      </div>

      {/* ── モバイル: 下部タブバー ── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: 56,
          background: 'var(--color-bg-white)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'stretch',
          zIndex: 200,
          boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
        }}>
          {BOTTOM_TABS.map(({ path, Icon, ja, en }) => {
            const active = isActive(path);
            const label = lang === 'ja' ? ja : en;
            return (
              <button
                key={path}
                onClick={() => { setOthersOpen(false); navigate(path); }}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 3, border: 'none', background: 'none', cursor: 'pointer',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-light)',
                  padding: '6px 4px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', transform: 'scale(1.2)', marginBottom: 2 }}>
                  <Icon />
                </span>
                <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </button>
            );
          })}
          {/* その他タブ */}
          <button
            onClick={() => setOthersOpen(prev => !prev)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, border: 'none', background: 'none', cursor: 'pointer',
              color: isOthersActive || othersOpen ? 'var(--color-primary)' : 'var(--color-text-light)',
              padding: '6px 4px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <IconMore />
            </span>
            <span style={{ fontSize: 11, fontWeight: isOthersActive || othersOpen ? 700 : 400, lineHeight: 1 }}>
              {lang === 'ja' ? 'その他' : 'More'}
            </span>
          </button>
        </nav>
      )}
    </div>
  );
}
