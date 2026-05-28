import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_LEVEL } from '../constants';
import { getPoints, fetchPointsFromServer } from '../utils/points';
import Breadcrumb from './Breadcrumb';
import Button from './ui/Button';
import {
  IconHome,
  IconUser, IconChart,
  IconDumbbell, IconFire, IconMenu, IconClose, IconChevronLeft, IconMail,
  IconSparkles, IconBot, IconFootprint, IconBookOpen,
  IconSun, IconMoon, IconMore, IconChevronDown,
} from './Icons';

type BreadcrumbItem = { label: string; path?: string };

const NAV_KEYS = [
  { path: '/aws/',          labelKey: 'nav.home',         Icon: IconHome      },
  { path: '/aws/practice',  labelKey: 'nav.practice',     Icon: IconDumbbell  },
  { path: '/aws/stats',     labelKey: 'nav.stats',        Icon: IconFootprint },
  { path: '/aws/encyclopedia',   labelKey: 'nav.encyclopedia', Icon: IconBookOpen, bottom: true },
  { path: '/aws/growth',        labelKey: 'nav.growth',       Icon: IconBot, bottom: true },
  { path: '/aws/release-notes', labelKey: 'nav.releaseNotes', Icon: IconFire,     bottom: true },
];

const BOTTOM_TABS = [
  { path: '/aws/',          Icon: IconHome,        ja: 'ホーム',       en: 'Home'     },
  { path: '/aws/practice',  Icon: IconDumbbell,    ja: 'トレーニング', en: 'Training' },
  { path: '/aws/stats',     Icon: IconFootprint,   ja: '足あと',      en: 'History'  },
];

const OTHERS_ITEMS = [
  { path: '/aws/encyclopedia',  Icon: IconBookOpen,   labelKey: 'nav.encyclopedia' },
  { path: '/aws/growth',        Icon: IconBot,        labelKey: 'nav.growth'       },
  { path: '/aws/release-notes', Icon: IconFire,       labelKey: 'nav.releaseNotes' },
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
  const uid = user?.userId ?? 'guest';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [open, setOpen] = useState(() => {
    if (window.innerWidth < 768) return false;
    return localStorage.getItem(`sidebarOpen_${uid}`) !== 'false';
  });
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(`targetExam_${uid}`));
  const [points, setPoints] = useState(() => getPoints(uid));
  const [ptsDelta, setPtsDelta] = useState<number | null>(null);
  const ptsRef = useRef(getPoints(uid));
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrame = useRef<number | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactDone, setContactDone] = useState(false);
  const [contactError, setContactError] = useState(false);



  const swipeStartX = useRef<number>(0);
  const swipeStartY = useRef<number>(0);
  const isDraggingH = useRef<boolean>(false);
  const SWIPE_THRESHOLD = 72;
  const TAB_PATHS = [...BOTTOM_TABS.map(t => t.path), '/aws/others'];
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeTrans, setSwipeTrans] = useState(false);

  const doTabNavigate = (nextPath: string, dir: 'left' | 'right') => {
    const outX = dir === 'left' ? -window.innerWidth : window.innerWidth;
    setSwipeTrans(true);
    setSwipeOffset(outX);
    setTimeout(() => {
      navigate(nextPath);
      setSwipeTrans(false);
      setSwipeOffset(0);
    }, 240);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    isDraggingH.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - swipeStartX.current;
    const dy = e.touches[0].clientY - swipeStartY.current;
    if (!isDraggingH.current) {
      if (Math.abs(dy) > Math.abs(dx) + 4 || Math.abs(dx) < 6) return;
      isDraggingH.current = true;
    }
    const idx = TAB_PATHS.indexOf(location.pathname);
    if (idx === -1) return;
    const atStart = idx === 0 && dx > 0;
    const atEnd   = idx === TAB_PATHS.length - 1 && dx < 0;
    setSwipeOffset(atStart || atEnd ? dx * 0.15 : dx);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDraggingH.current) return;
    isDraggingH.current = false;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    const idx = TAB_PATHS.indexOf(location.pathname);
    if (idx !== -1 && Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && idx < TAB_PATHS.length - 1) doTabNavigate(TAB_PATHS[idx + 1], 'left');
      else if (dx > 0 && idx > 0)               doTabNavigate(TAB_PATHS[idx - 1], 'right');
      else { setSwipeTrans(true); setSwipeOffset(0); }
    } else {
      setSwipeTrans(true);
      setSwipeOffset(0);
    }
  };

  useEffect(() => {
    setTargetExam(localStorage.getItem(`targetExam_${uid}`));
  }, [location.pathname, uid]);

  useEffect(() => {
    const init = getPoints(uid);
    ptsRef.current = init;
    setPoints(init);
    const handler = (e: Event) => {
      const next = (e as CustomEvent).detail as number;
      const diff = next - ptsRef.current;
      if (diff !== 0) {
        setPtsDelta(diff);
        if (deltaTimer.current) clearTimeout(deltaTimer.current);
        deltaTimer.current = setTimeout(() => setPtsDelta(null), 1800);
      }
      const from = ptsRef.current;
      ptsRef.current = next;
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      const duration = 500;
      const startTime = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        setPoints(Math.round(from + (next - from) * ease));
        if (t < 1) animFrame.current = requestAnimationFrame(tick);
      };
      animFrame.current = requestAnimationFrame(tick);
    };
    window.addEventListener('pointsChanged', handler);
    return () => {
      window.removeEventListener('pointsChanged', handler);
      if (deltaTimer.current) clearTimeout(deltaTimer.current);
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [uid]);

  // ログイン済みのときサーバーからポイントを取得してローカルを上書き
  useEffect(() => {
    if (!user) return;
    fetchPointsFromServer(uid).then(pts => {
      if (pts === null) return;
      localStorage.setItem(`userPoints_${uid}`, String(pts));
      setPoints(pts);
    });
  }, [user?.userId]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // ルート変更でサイドバー・モバイルパネルを閉じる
  useEffect(() => {
    if (isMobile) { setOpen(false); }
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


  useEffect(() => {
    document.documentElement.style.setProperty(
      '--content-left',
      (!isMobile && open) ? 'var(--sidebar-width)' : '0px'
    );
  }, [open, isMobile]);

  const toggle = () => setOpen(prev => {
    if (!isMobile) localStorage.setItem(`sidebarOpen_${uid}`, String(!prev));
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
    (path === '/aws/' || path === '/aws')
      ? (location.pathname === '/aws/' || location.pathname === '/aws')
      : location.pathname.startsWith(path);

  const isOthersActive = location.pathname === '/aws/others' || OTHERS_ITEMS.some(item => isActive(item.path));

  const navItems = NAV_KEYS;

  const breadcrumbs: Record<string, BreadcrumbItem[]> = {
    '/aws/practice':         [{ label: t('nav.home'), path: '/aws/' }, { label: t('nav.practice') }],
    '/aws/encyclopedia':     [{ label: t('nav.home'), path: '/aws/' }, { label: t('nav.encyclopedia') }],
    '/aws/growth':           [{ label: t('nav.home'), path: '/aws/' }, { label: t('nav.growth') }],
    '/aws/exercise/setup':   [{ label: t('nav.home'), path: '/aws/' }, { label: t('exerciseSetup.title') }],
    '/aws/exercise/session': [{ label: t('nav.home'), path: '/aws/' }, { label: t('exerciseSetup.title'), path: '/aws/exercise/setup' }, { label: t('nav.exerciseSession') }],
    '/aws/exam/setup':       [{ label: t('nav.home'), path: '/aws/' }, { label: t('examSetup.title') }],
    '/aws/exam/session':     [{ label: t('nav.home'), path: '/aws/' }, { label: t('examSetup.title'), path: '/aws/exam/setup' }, { label: t('nav.examSession') }],
    '/aws/result':           [{ label: t('nav.home'), path: '/aws/' }, { label: t('nav.result') }],
    '/aws/stats':            [{ label: t('nav.home'), path: '/aws/' }, { label: t('stats.title') }],
    '/aws/release-notes':    [{ label: t('nav.home'), path: '/aws/' }, { label: t('nav.releaseNotes') }],
    '/about':                [{ label: t('nav.home'), path: '/aws/' }, { label: t('nav.about') }],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'inherit' }}>

      {/* ── 連絡先モーダル ── */}
      {showContact && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowContact(false); } }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: isMobile ? '20px 18px' : '28px 32px', width: '100%', maxWidth: 480, boxShadow: 'var(--box-shadow-md)', maxHeight: isMobile ? '66vh' : '90vh', overflowY: 'auto' }}>
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
        height: 56, minHeight: 56, background: 'var(--color-bg-white)',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 12px 0 8px' : '0 var(--spacing-lg)',
        gap: 'var(--spacing-md)', zIndex: 200, flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
      }}>

        {/* サービス名 */}
        <div onClick={() => navigate('/aws/')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flexShrink: 0, padding: '0 4px' }}>
          <img
            src={isMobile ? '/mugen-icon.png' : '/mugen-header.png'}
            alt="AWS資格無限ノック"
            style={{ height: isMobile ? 32 : 36, width: 'auto', display: 'block' }}
          />
        </div>

        {/* ポイント表示＋アカウントボタン（モバイル・デスクトップ共通） */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {user && (
            <>
              <style>{`
                @keyframes pts-delta-fly {
                  0%   { opacity: 1; transform: translateY(0) scale(1); }
                  60%  { opacity: 1; transform: translateY(-14px) scale(1.1); }
                  100% { opacity: 0; transform: translateY(-22px) scale(0.9); }
                }
              `}</style>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, userSelect: 'none', position: 'relative' }}>
                <span style={{ color: '#009E9E', display: 'flex', alignItems: 'center' }}><IconSparkles size={14} /></span>
                <span style={{ color: '#009E9E', fontWeight: 800, fontSize: 'var(--font-size-sm)', minWidth: '3ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{points}</span>
                {ptsDelta !== null && (
                  <span style={{
                    position: 'absolute', right: -28, top: -2,
                    fontSize: 11, fontWeight: 800,
                    color: ptsDelta > 0 ? '#009E9E' : 'var(--color-danger)',
                    whiteSpace: 'nowrap', pointerEvents: 'none',
                    animation: 'pts-delta-fly 1.8s ease-out forwards',
                  }}>
                    {ptsDelta > 0 ? `+${ptsDelta}` : ptsDelta}
                  </span>
                )}
              </div>
            </>
          )}
          <button
            onClick={() => navigate('/account')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: user ? 'var(--color-primary-light)' : 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '50%',
              cursor: 'pointer', color: user ? 'var(--color-primary)' : 'var(--color-text-sub)',
              width: 36, height: 36, padding: 0,
              flexShrink: 0,
              transition: 'background 0.2s',
              fontSize: 14, fontWeight: 700, letterSpacing: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-main)'}
            onMouseLeave={e => e.currentTarget.style.background = user ? 'var(--color-primary-light)' : 'transparent'}
          >
            {user?.email ? (user.email[0].toUpperCase()) : <IconUser />}
          </button>
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
          {!isMobile && breadcrumbs[location.pathname] && (
            <Breadcrumb
              items={breadcrumbs[location.pathname]}
              style={{ marginBottom: 0, fontSize: 'var(--font-size-sm)' }}
            />
          )}
        </div>
        {targetExam && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, paddingRight: 'var(--spacing-xs)' }}>
            <span style={{
              fontSize: 'var(--font-size-xs)', fontWeight: 700,
              color: 'var(--color-text-sub)',
              whiteSpace: 'nowrap',
              maxWidth: isMobile ? '40vw' : '35vw',
              overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block',
            }}>
              {isMobile
                ? (EXAM_CONFIGS[targetExam]?.fullName ?? targetExam).replace(/^AWS Certified\s+/i, '')
                : (EXAM_CONFIGS[targetExam]?.fullName ?? targetExam)}
            </span>
            <button
              onClick={() => navigate('/account')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', padding: '0 2px', fontSize: 'var(--font-size-xs)', fontWeight: 700, lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}
              title="目標資格を変更"
            >›</button>
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
                <button
                  onClick={() => navigate('/')}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 24px',
                    background: 'none', border: 'none',
                    borderTop: '2px solid var(--color-border)',
                    borderLeft: '4px solid transparent',
                    cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', fontWeight: 700,
                    whiteSpace: 'nowrap', transition: 'all 0.2s',
                    marginTop: 4,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-main)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <img src="/mugen-icon.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain', opacity: 0.7 }} />
                  </span>
                  <span>無限ノック</span>
                </button>
              </div>
            </div>
          </nav>
        )}

        {/* メインコンテンツ */}
        <main
          ref={mainRef}
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchMove={isMobile ? handleTouchMove : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
          style={{
            flex: 1, overflow: 'auto',
            background: 'var(--color-bg-main)',
            width: '100%',
            WebkitOverflowScrolling: 'touch',
            minWidth: 0,
            paddingBottom: isMobile ? 120 : (['/aws/practice', '/aws/', '/aws'].includes(location.pathname) ? 80 : 0),
            transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : undefined,
            transition: swipeTrans ? 'transform 0.24s ease' : 'none',
            willChange: swipeOffset !== 0 ? 'transform' : undefined,
          }}
        >
          {children}
          <footer style={{
            borderTop: '1px solid var(--color-border)',
            padding: '16px var(--spacing-lg)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px 24px',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-light)',
            marginTop: 'auto',
          }}>
            <span>© {new Date().getFullYear()} AWS資格無限ノック</span>
            <button
              onClick={() => navigate('/about#privacy')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', fontSize: 'var(--font-size-xs)', textDecoration: 'underline' }}
            >
              {lang === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}
            </button>
            <button
              onClick={() => navigate('/about#terms')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', fontSize: 'var(--font-size-xs)', textDecoration: 'underline' }}
            >
              {lang === 'ja' ? '利用規約' : 'Terms of Service'}
            </button>
          </footer>
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
            onClick={() => navigate('/aws/others')}
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
