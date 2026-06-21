'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_LEVEL, EXAM_LEVEL_COLORS } from '../constants';
import { getPoints, fetchPointsFromServer } from '../utils/points';
import { loadTargetExamFromServer } from '../utils/preferences';
import Breadcrumb from './Breadcrumb';
import Button from './ui/Button';
import {
  IconHome,
  IconUser, IconChart,
  IconDumbbell, IconFire, IconMenu, IconClose, IconChevronLeft, IconMail,
  IconSparkles, IconBot, IconUserCircle, IconBookOpen,
  IconSun, IconMoon, IconMore, IconChevronDown,
  EXAM_ICON_COMPONENTS,
} from './Icons';

type BreadcrumbItem = { label: string; path?: string };

const NAV_KEYS = [
  { path: '/aws/',             labelKey: 'nav.home',         Icon: IconHome      },
  { path: '/aws/practice',     labelKey: 'nav.practice',     Icon: IconDumbbell  },
  { path: '/aws/mypage',       labelKey: 'nav.mypage',       Icon: IconUserCircle },
  { path: '/aws/encyclopedia', labelKey: 'nav.encyclopedia', Icon: IconBookOpen, bottom: true },
  { path: '/aws/growth',       labelKey: 'nav.growth',       Icon: IconBot, bottom: true },
  { path: '/aws/release-notes', labelKey: 'nav.releaseNotes', Icon: IconFire, bottom: true },
];

const BOTTOM_TABS = [
  { path: '/aws/',         Icon: IconHome,        ja: 'ホーム',       en: 'Home'     },
  { path: '/aws/practice', Icon: IconDumbbell,    ja: 'トレーニング', en: 'Training' },
  { path: '/aws/mypage',   Icon: IconUserCircle,  ja: 'マイページ',   en: 'My Page'  },
];

const OTHERS_ITEMS = [
  { path: '/aws/encyclopedia',  Icon: IconBookOpen, labelKey: 'nav.encyclopedia' },
  { path: '/aws/growth',        Icon: IconBot,      labelKey: 'nav.growth'       },
  { path: '/aws/release-notes', Icon: IconFire,     labelKey: 'nav.releaseNotes' },
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
  // Next.js の trailingSlash: true により pathname が '/aws/practice/' のように末尾スラッシュを持つ。
  // 既存の比較・TAB_PATHS・breadcrumb キーはスラッシュなし前提なので、ここで正規化する。
  const pathname = location.pathname === '/' ? '/' : location.pathname.replace(/\/$/, '');
  const mainRef = useRef<HTMLElement>(null);
  const uid = user?.userId ?? 'guest';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [cookieConsent, setCookieConsent] = useState<boolean>(() =>
    localStorage.getItem('cookie_consent_v1') === 'accepted'
  );
  const acceptCookies = () => {
    localStorage.setItem('cookie_consent_v1', 'accepted');
    setCookieConsent(true);
  };
  const [open, setOpen] = useState(() => {
    if (window.innerWidth < 768) return false;
    return localStorage.getItem(`sidebarOpen_${uid}`) !== 'false';
  });
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(`targetExam_${uid}`));
  const [examDate, setExamDate] = useState<string | null>(() => {
    const te = localStorage.getItem(`targetExam_${uid}`);
    return te ? localStorage.getItem(`examDate_${te}_${uid}`) : null;
  });
  const [points, setPoints] = useState(() => getPoints(uid));
  const [ptsDelta, setPtsDelta] = useState<number | null>(null);
  const ptsRef = useRef(getPoints(uid));
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrame = useRef<number | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [showPointsInfo, setShowPointsInfo] = useState(false);
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactDone, setContactDone] = useState(false);
  const [contactError, setContactError] = useState(false);



  const swipeStartX = useRef<number>(0);
  const swipeStartY = useRef<number>(0);
  const isDraggingH = useRef<boolean>(false);
  const SWIPE_THRESHOLD = 72;
  const TAB_PATHS      = [...BOTTOM_TABS.map(t => t.path), '/aws/others'];
  // indexOf 比較用（pathname は末尾スラッシュ除去済みなので揃える）
  const TAB_PATHS_NORM = TAB_PATHS.map(p => p !== '/' ? p.replace(/\/$/, '') : p);
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
    const idx = TAB_PATHS_NORM.indexOf(pathname);
    if (idx === -1) return;
    const atStart = idx === 0 && dx > 0;
    const atEnd   = idx === TAB_PATHS.length - 1 && dx < 0;
    setSwipeOffset(atStart || atEnd ? dx * 0.15 : dx);
  };

  const handleTouchCancel = () => {
    if (!isDraggingH.current) return;
    isDraggingH.current = false;
    setSwipeTrans(true);
    setSwipeOffset(0);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDraggingH.current) return;
    isDraggingH.current = false;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    const idx = TAB_PATHS_NORM.indexOf(pathname);
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
    const te = localStorage.getItem(`targetExam_${uid}`);
    setTargetExam(te);
    setExamDate(te ? localStorage.getItem(`examDate_${te}_${uid}`) : null);
  }, [location.pathname, uid]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { examType, date } = (e as CustomEvent).detail ?? {};
      const te = localStorage.getItem(`targetExam_${uid}`);
      if (te && examType === te) setExamDate(date ?? null);
    };
    window.addEventListener('examDateChanged', handler);
    return () => window.removeEventListener('examDateChanged', handler);
  }, [uid]);

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

  // ログイン済みのときサーバーからポイントと設定を取得してローカルを上書き
  useEffect(() => {
    if (!user) return;
    fetchPointsFromServer(uid).then(pts => {
      if (pts === null) return;
      localStorage.setItem(`userPoints_${uid}`, String(pts));
      setPoints(pts);
    });
    loadTargetExamFromServer(user.userId, uid).then(serverExam => {
      if (serverExam) {
        setTargetExam(serverExam);
        const te = serverExam;
        setExamDate(te ? localStorage.getItem(`examDate_${te}_${uid}`) : null);
      }
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

  const daysUntilExam = (dateStr: string): number => {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const d0 = new Date(today).getTime();
    const d1 = new Date(dateStr).getTime();
    return Math.round((d1 - d0) / 86400000);
  };

  const isActive = (path: string) =>
    (path === '/aws/' || path === '/aws')
      ? (pathname === '/aws/' || pathname === '/aws')
      : pathname.startsWith(path);

  const isOthersActive = pathname === '/aws/others' || OTHERS_ITEMS.some(item => isActive(item.path));

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

      {/* ── Cookie 同意バナー ── */}
      {!cookieConsent && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: 'var(--color-bg-elevated)',
          borderTop: '1px solid var(--color-border)',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.1)',
        }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
            {lang === 'ja'
              ? '本サービスは、広告配信・アクセス解析のためにCookieを使用しています。'
              : 'This site uses cookies for advertising and analytics.'}
            {' '}
            <button onClick={() => navigate('/about#privacy')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', fontSize: 'var(--font-size-xs)', textDecoration: 'underline' }}>
              {lang === 'ja' ? '詳細' : 'Learn more'}
            </button>
          </span>
          <button
            onClick={acceptCookies}
            style={{ flexShrink: 0, padding: '6px 18px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--border-radius-full)', fontWeight: 700, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}
          >
            {lang === 'ja' ? '同意して閉じる' : 'Accept'}
          </button>
        </div>
      )}

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



      {/* ── SPポイント説明モーダル ── */}
      {showPointsInfo && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPointsInfo(false); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: isMobile ? '20px 18px' : '24px 28px', width: '100%', maxWidth: 380, boxShadow: 'var(--box-shadow-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ color: '#009E9E', display: 'flex', alignItems: 'center' }}><IconSparkles size={18} /></span>
                <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
                  {lang === 'ja' ? 'SPとは？' : 'What is SP?'}
                </span>
              </div>
              <button onClick={() => setShowPointsInfo(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
            </div>

            {/* 獲得方法 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 10, letterSpacing: '0.5px' }}>
                {lang === 'ja' ? '獲得方法' : 'How to earn'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-sub)', marginBottom: 8 }}>
                {lang === 'ja' ? '問題に正解するとSPを獲得できます。資格のレベルが高いほど多く獲得できます。' : 'Earn SP by answering questions correctly. Higher certification levels give more SP.'}
              </div>
              <div style={{ background: 'var(--color-bg-main)', borderRadius: 8, overflow: 'hidden' }}>
                {([
                  { level: 'Foundational', pts: 1, exams: 'CLF, AIF' },
                  { level: 'Associate',    pts: 2, exams: 'SAA, DVA, SOA, DEA, MLA' },
                  { level: 'Professional', pts: 3, exams: 'SAP, DOP, AIP' },
                  { level: 'Specialty',    pts: 3, exams: 'ANS, SCS' },
                ] as const).map((row, i, arr) => (
                  <div key={row.level} style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-main)' }}>{row.level}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-light)', marginTop: 1 }}>{row.exams}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, flexShrink: 0 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: '#009E9E', fontVariantNumeric: 'tabular-nums' }}>+{row.pts}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{lang === 'ja' ? 'SP/問' : 'SP/q'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 使い道 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 10, letterSpacing: '0.5px' }}>
                {lang === 'ja' ? '使い道' : 'How to use'}
              </div>
              <div style={{ background: 'var(--color-bg-main)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--color-text-main)' }}>
                  {lang === 'ja' ? '日めくりサービスの更新' : 'Daily service reroll'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#009E9E', fontVariantNumeric: 'tabular-nums' }}>30</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>SP</span>
                </div>
              </div>
            </div>
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
        <div onClick={() => navigate('/aws/')} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', flexShrink: 0, padding: '0 4px' }}>
          <img src="/mugen-icon.png"   alt="無限ノック" style={{ height: 28, width: 'auto', display: 'block', flexShrink: 0 }} />
          <img src="/mugen-header.png" alt=""           style={{ height: 28, width: 'auto', display: 'block', flexShrink: 0 }} />
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
              <div onClick={() => setShowPointsInfo(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none', position: 'relative', border: '1.5px solid #009E9E', borderRadius: 6, padding: '3px 8px 3px 6px', background: 'rgba(0,158,158,0.05)', cursor: 'pointer' }}>
                <span style={{ color: '#009E9E', display: 'flex', alignItems: 'center' }}><IconSparkles size={17} /></span>
                <span style={{ color: '#009E9E', fontWeight: 800, fontSize: 'var(--font-size-sm)', minWidth: '3ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{points}<span style={{ fontSize: 10, fontWeight: 600, marginLeft: 1 }}>p</span></span>
                {ptsDelta !== null && (
                  <span style={{
                    position: 'absolute', right: -32, top: -2,
                    fontSize: 11, fontWeight: 800,
                    color: ptsDelta > 0 ? '#009E9E' : 'var(--color-danger)',
                    whiteSpace: 'nowrap', pointerEvents: 'none',
                    animation: 'pts-delta-fly 1.8s ease-out forwards',
                  }}>
                    {ptsDelta > 0 ? `+${ptsDelta}p` : `${ptsDelta}p`}
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
      {/* モバイルでは目標ボタンが表示される場合のみサブバーを描画 */}
      {(!isMobile || (!!targetExam && !isOthersActive && !['/aws/exercise/session', '/aws/exam/session', '/aws/mypage', '/aws/exam-dashboard'].includes(pathname))) && (
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
        {/* デスクトップ: パンくずエリア */}
        {!isMobile && (
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            {breadcrumbs[pathname] && (
              <Breadcrumb
                items={breadcrumbs[pathname]}
                style={{ marginBottom: 0, fontSize: 'var(--font-size-sm)' }}
              />
            )}
          </div>
        )}
        {targetExam && !(isMobile && isOthersActive) && !(['/aws/exercise/session', '/aws/exam/session', '/aws/mypage', '/aws/exam-dashboard'].includes(pathname)) && (
          <button
            onClick={() => navigate('/aws/mypage')}
            title="マイページ"
            style={{
              ...(isMobile ? { flex: 1 } : { flexShrink: 0 }),
              minWidth: 0,
              display: 'flex', alignItems: 'center',
              justifyContent: 'flex-end',
              alignSelf: 'stretch',
              cursor: 'pointer', transition: 'background 0.15s',
              background: 'transparent', border: 'none', padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-main)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ minWidth: 0, padding: '4px 4px 4px 8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              <span style={{
                display: 'block',
                minWidth: 0,
                fontSize: 13, fontWeight: 700,
                color: 'var(--color-text-sub)',
                whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: isMobile ? 'none' : '40vw',
              }}>
                {(() => {
                  const examColor = EXAM_LEVEL_COLORS[EXAM_LEVEL[targetExam]] ?? 'var(--color-primary)';
                  const name = isMobile ? `AWS ${targetExam}` : ((EXAM_CONFIGS[targetExam]?.fullName ?? targetExam).replace('AWS Certified ', ''));
                  const ExamIcon = EXAM_ICON_COMPONENTS[targetExam];
                  return <>{'設定目標：'}<span style={{ color: examColor, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{ExamIcon && <ExamIcon size={13} />}{name}</span></>;
                })()}
                {examDate && (() => {
                  const days = daysUntilExam(examDate);
                  if (days === 0) return <span style={{ color: 'var(--color-text-sub)', fontWeight: 700 }}>（試験当日！ファイト🔥）</span>;
                  if (days > 0) return <span>（あと<span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>{days}</span>日！）</span>;
                  return null;
                })()}
              </span>
            </div>
            <span style={{
              flexShrink: 0,
              color: 'var(--color-primary)',
              fontSize: 26, fontWeight: 900,
              padding: '0 10px 0 2px',
              lineHeight: 1,
            }}>›</span>
          </button>
        )}
      </div>
      )}

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
        <main
          ref={mainRef}
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchMove={isMobile ? handleTouchMove : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
          onTouchCancel={isMobile ? handleTouchCancel : undefined}
          style={{
            flex: 1, overflow: 'auto',
            background: 'var(--color-bg-main)',
            width: '100%',
            WebkitOverflowScrolling: 'touch',
            minWidth: 0,
            paddingBottom: isMobile ? 120 : (['/aws/practice', '/aws/', '/aws'].includes(pathname) ? 80 : 0),
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
            <span>© {new Date().getFullYear()} 無限ノック</span>
            <span style={{ width: '100%', textAlign: 'center', fontSize: 10, color: 'var(--color-text-light)', opacity: 0.7 }}>
              {lang === 'ja'
                ? 'AWSはAmazon Web Services, Inc.の商標です。本サービスはAmazonと無関係の非公式サービスです。'
                : 'AWS is a trademark of Amazon Web Services, Inc. This is an unofficial service unaffiliated with Amazon.'}
            </span>
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
