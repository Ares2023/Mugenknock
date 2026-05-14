import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_LEVEL } from '../constants';
import Breadcrumb from './Breadcrumb';
import Button from './ui/Button';
import {
  IconHome, IconList,
  IconUser, IconChart, IconInfo,
  IconFire, IconMenu, IconClose, IconChevronLeft, IconMail,
  IconSparkles, IconFootprint
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
  { path: '/',          labelKey: 'nav.home',      Icon: IconHome      },
  { path: '/practice',  labelKey: 'nav.practice',  Icon: IconFire      },
  { path: '/stats',     labelKey: 'nav.stats',     Icon: IconFootprint },
  { path: '/questions',     labelKey: 'nav.questions',    Icon: IconList,     bottom: true },
  { path: '/growth',        labelKey: 'nav.growth',       Icon: IconSparkles, bottom: true },
  { path: '/release-notes', labelKey: 'nav.releaseNotes', Icon: IconFire,     bottom: true },
  { path: '/architecture',  labelKey: 'nav.architecture', Icon: IconInfo,     bottom: true },
];

const BOTTOM_TABS = [
  { path: '/',          Icon: IconHome,        ja: 'サクッと演習', en: 'Quick'    },
  { path: '/practice',  Icon: IconFire,        ja: '演習・テスト', en: 'Practice' },
  { path: '/stats',     Icon: IconFootprint,   ja: '足あと',      en: 'History'  },
];

const OTHERS_ITEMS = [
  { path: '/questions',     Icon: IconList,       labelKey: 'nav.questions'    },
  { path: '/growth',        Icon: IconSparkles,   labelKey: 'nav.growth'       },
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


  const [sidebarExamOpen, setSidebarExamOpen] = useState(false);
  const sidebarExamRef = useRef<HTMLDivElement>(null);
  const [mobileExamPanelOpen, setMobileExamPanelOpen] = useState(false);

  useEffect(() => {
    setTargetExam(localStorage.getItem('targetExam'));
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sidebarExamRef.current && !sidebarExamRef.current.contains(e.target as Node)) {
        setSidebarExamOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSidebarExamSelect = (et: string) => {
    localStorage.setItem('targetExam', et);
    setTargetExam(et);
    setSidebarExamOpen(false);
    window.dispatchEvent(new CustomEvent('targetExamChanged', { detail: et }));
  };

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // ルート変更でサイドバー・モバイルパネルを閉じる
  useEffect(() => {
    if (isMobile) { setOpen(false); setMobileExamPanelOpen(false); }
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
    if (isMobile) setOpen(false);
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const isOthersActive = location.pathname === '/others' || OTHERS_ITEMS.some(item => isActive(item.path));

  const navItems = NAV_KEYS;

  const breadcrumbs: Record<string, BreadcrumbItem[]> = {
    '/practice':         [{ label: t('nav.home'), path: '/' }, { label: '演習・テスト' }],
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
            src={isMobile ? '/mugen-icon.png' : '/mugen-header.png'}
            alt="AWS資格無限ノック"
            style={{ height: isMobile ? 32 : 36, width: 'auto', display: 'block' }}
          />
        </div>

        {/* モバイルのみ: 目標試験ボタン */}
        {isMobile && (
          <button
            onClick={() => setMobileExamPanelOpen(v => !v)}
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 'var(--border-radius-md)',
              cursor: 'pointer', color: 'white',
              padding: '5px 10px', fontSize: 'var(--font-size-sm)', fontWeight: 700,
              maxWidth: '45vw', overflow: 'hidden',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {targetExam ?? (lang === 'ja' ? '試験選択' : 'Exam')}
            </span>
            <span style={{ fontSize: 8, opacity: 0.8, flexShrink: 0, transform: mobileExamPanelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>
        )}

        {/* アカウントボタン（モバイル・デスクトップ共通） */}
        <div style={{ marginLeft: isMobile ? 'var(--spacing-sm)' : 'auto', flexShrink: 0 }}>
          <button
            onClick={() => navigate('/account')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: user ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: '50%',
              cursor: 'pointer', color: 'white',
              width: 36, height: 36, padding: 0,
              flexShrink: 0,
              transition: 'background 0.2s',
              fontSize: 14, fontWeight: 700, letterSpacing: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
            onMouseLeave={e => e.currentTarget.style.background = user ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}
          >
            {user?.email ? (user.email[0].toUpperCase()) : <IconUser />}
          </button>
        </div>
      </header>

      {/* ── モバイル試験選択スライドアップパネル ── */}
      {isMobile && mobileExamPanelOpen && (
        <>
          <div
            onClick={() => setMobileExamPanelOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 250 }}
          />
          <div style={{
            position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 260,
            background: 'var(--color-bg-white)',
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
            maxHeight: '55vh', overflowY: 'auto',
            animation: 'slideUp 0.22s ease',
          }}>
            <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
                {lang === 'ja' ? '目標試験を選択' : 'Select Target Exam'}
              </span>
              <button
                onClick={() => setMobileExamPanelOpen(false)}
                style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '0 4px', lineHeight: 1 }}
              >✕</button>
            </div>
            {(['Foundational', 'Associate', 'Professional'] as const).map((level, li) => {
              const levelItems = EXAM_TYPES.filter(et => EXAM_LEVEL[et] === level);
              if (levelItems.length === 0) return null;
              return (
                <div key={level}>
                  {li > 0 && <div style={{ height: 1, background: 'var(--color-border)' }} />}
                  <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {level}
                  </div>
                  {levelItems.map(et => {
                    const sel = targetExam === et;
                    return (
                      <button
                        key={et}
                        onClick={() => { handleSidebarExamSelect(et); setMobileExamPanelOpen(false); }}
                        style={{
                          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '11px 16px', border: 'none',
                          background: sel ? 'var(--color-primary-light)' : 'transparent',
                          cursor: 'pointer', fontSize: 'var(--font-size-base)',
                          color: sel ? 'var(--color-primary)' : 'var(--color-text-main)',
                          fontWeight: sel ? 700 : 400,
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: 40, flexShrink: 0 }}>{et}</span>
                        <span style={{ fontSize: 'var(--font-size-sm)', color: sel ? 'var(--color-primary)' : 'var(--color-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {EXAM_CONFIGS[et].fullName}
                        </span>
                        {sel && <span style={{ marginLeft: 'auto', color: 'var(--color-primary)', flexShrink: 0, fontSize: 14 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            <div style={{ height: 12 }} />
          </div>
        </>
      )}

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
          {!isMobile && breadcrumbs[location.pathname] && (
            <Breadcrumb
              items={breadcrumbs[location.pathname]}
              style={{ marginBottom: 0, fontSize: 'var(--font-size-sm)' }}
            />
          )}
        </div>
        {targetExam && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingRight: 'var(--spacing-xs)' }}>
            <span style={{
              background: 'var(--color-secondary)', color: 'white',
              fontSize: 'var(--font-size-xs)', padding: '5px 12px',
              borderRadius: 'var(--border-radius-full)', fontWeight: 700,
              lineHeight: 1, display: 'inline-block', whiteSpace: 'nowrap',
              maxWidth: isMobile ? '55vw' : '40vw',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {EXAM_CONFIGS[targetExam]?.fullName ?? targetExam}
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

              {/* 試験選択ドロップダウン */}
              <div style={{ padding: '4px 12px 10px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>
                  {lang === 'ja' ? '目標試験' : 'Target Exam'}
                </div>
                <div ref={sidebarExamRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setSidebarExamOpen(v => !v)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                      padding: '6px 10px', border: `1.5px solid ${sidebarExamOpen ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--border-radius-md)', background: 'var(--color-bg-main)',
                      cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: 600,
                      color: targetExam ? 'var(--color-text-main)' : 'var(--color-text-light)',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {targetExam ?? (lang === 'ja' ? '未選択' : 'Not selected')}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--color-primary)', flexShrink: 0, transform: sidebarExamOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                  </button>
                  {sidebarExamOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                      background: 'var(--color-bg-white)', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--border-radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      zIndex: 400, maxHeight: 220, overflowY: 'auto',
                    }}>
                      {(['Foundational', 'Associate', 'Professional'] as const).map((level, li) => {
                        const items = EXAM_TYPES.filter(et => EXAM_LEVEL[et] === level);
                        if (items.length === 0) return null;
                        return (
                          <div key={level}>
                            {li > 0 && <div style={{ height: 1, background: 'var(--color-border)' }} />}
                            <div style={{ padding: '4px 10px 2px', fontSize: 9, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {level}
                            </div>
                            {items.map(et => {
                              const selected = targetExam === et;
                              return (
                                <button
                                  key={et}
                                  onClick={() => handleSidebarExamSelect(et)}
                                  style={{
                                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '6px 10px', border: 'none',
                                    background: selected ? 'var(--color-primary-light)' : 'transparent',
                                    cursor: 'pointer', fontSize: 'var(--font-size-sm)',
                                    color: selected ? 'var(--color-primary)' : 'var(--color-text-main)',
                                    fontWeight: selected ? 700 : 400,
                                  }}
                                  onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--color-bg-main)'; }}
                                  onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                                >
                                  <span style={{ fontWeight: 700, minWidth: 32, flexShrink: 0 }}>{et}</span>
                                  <span style={{ fontSize: 10, color: selected ? 'var(--color-primary)' : 'var(--color-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {EXAM_CONFIGS[et].examCode}
                                  </span>
                                  {selected && <span style={{ marginLeft: 'auto', fontSize: 11, flexShrink: 0 }}>✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

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
                onClick={() => navigate(path)}
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
            onClick={() => navigate('/others')}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, border: 'none', background: 'none', cursor: 'pointer',
              color: isOthersActive ? 'var(--color-primary)' : 'var(--color-text-light)',
              padding: '6px 4px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <IconMore />
            </span>
            <span style={{ fontSize: 11, fontWeight: isOthersActive ? 700 : 400, lineHeight: 1 }}>
              {lang === 'ja' ? 'その他' : 'More'}
            </span>
          </button>
        </nav>
      )}
    </div>
  );
}
