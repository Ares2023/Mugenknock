import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { API_ENDPOINT, EXAM_CONFIGS, EXAM_DOMAINS, EXAM_TYPES, PASS_SCORES } from '../constants';
import Button from '../components/ui/Button';
import DomainSelector from '../components/DomainSelector';
import { IconCirclePause, IconCirclePlay } from '../components/Icons';
import { getCached, setCached, SHORT_TTL } from '../utils/cache';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const EXERCISE_PREFS_KEY = 'exercisePrefs';
const loadExercisePrefs = (et: string) => {
  try { return JSON.parse(localStorage.getItem(EXERCISE_PREFS_KEY) ?? '{}')[et] ?? {}; } catch { return {}; }
};
const saveExercisePrefs = (et: string, prefs: object) => {
  try {
    const stored = JSON.parse(localStorage.getItem(EXERCISE_PREFS_KEY) ?? '{}');
    stored[et] = prefs;
    localStorage.setItem(EXERCISE_PREFS_KEY, JSON.stringify(stored));
  } catch {}
};

type Tab = 'exercise' | 'exam';

export default function Practice() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const ja = lang === 'ja';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const [tab, setTab] = useState<Tab>('exercise');
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem('targetExam'));

  useEffect(() => {
    const handler = (e: Event) => setTargetExam((e as CustomEvent).detail);
    window.addEventListener('targetExamChanged', handler);
    return () => window.removeEventListener('targetExamChanged', handler);
  }, []);

  // ── カスタム演習 state ──
  const [examType, setExamType] = useState<string>(() =>
    localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA'
  );
  const initPrefs = (et: string) => loadExercisePrefs(et);
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => {
    const et = localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA';
    return initPrefs(et).domains ?? EXAM_DOMAINS[et] ?? [];
  });
  const [limit, setLimit] = useState<number>(() => initPrefs(localStorage.getItem('targetExam') || 'SAA').limit ?? 10);
  const [bookmarkOnly, setBookmarkOnly] = useState<boolean>(() => initPrefs(localStorage.getItem('targetExam') || 'SAA').bookmarkOnly ?? false);
  const [unansweredOnly, setUnansweredOnly] = useState<boolean>(() => initPrefs(localStorage.getItem('targetExam') || 'SAA').unansweredOnly ?? false);
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(() => initPrefs(localStorage.getItem('targetExam') || 'SAA').incorrectOnly ?? false);
  const [aiVerifiedOnly, setAiVerifiedOnly] = useState<boolean>(() => initPrefs(localStorage.getItem('targetExam') || 'SAA').aiVerifiedOnly ?? false);
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [exerciseLoading, setExerciseLoading] = useState(false);
  type DomainStat = { tagId: string; correctCount: number; incorrectCount: number };
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);

  const exerciseDraft = (() => {
    try { return JSON.parse(localStorage.getItem('exerciseDraft') ?? 'null'); } catch { return null; }
  })();
  const hasDraft = exerciseDraft?.examType === examType;

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const prefs = loadExercisePrefs(examType);
    setSelectedDomains(prefs.domains ?? EXAM_DOMAINS[examType]);
    setLimit(prefs.limit ?? 10);
    setBookmarkOnly(prefs.bookmarkOnly ?? false);
    setUnansweredOnly(prefs.unansweredOnly ?? false);
    setIncorrectOnly(prefs.incorrectOnly ?? false);
    setAiVerifiedOnly(prefs.aiVerifiedOnly ?? false);
  }, [examType]);

  useEffect(() => {
    saveExercisePrefs(examType, { domains: selectedDomains, limit, bookmarkOnly, unansweredOnly, incorrectOnly, aiVerifiedOnly });
  }, [examType, selectedDomains, limit, bookmarkOnly, unansweredOnly, incorrectOnly, aiVerifiedOnly]);

  useEffect(() => {
    setAvailableCount(null);
    const fetchCounts = async () => {
      if (selectedDomains.length === 0) { setAvailableCount(0); return; }
      try {
        const params = new URLSearchParams({ examType });
        const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
          const [qRes, bkmRes, answeredRes, incorrectRes] = await Promise.all([
            fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
            user && bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${user.userId}`).then(r => r.json()) : Promise.resolve(null),
            user && unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${user.userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
            user && incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${user.userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
          ]);
          let items: any[] = qRes.items ?? [];
          if (bookmarkOnly && bkmRes) { const ids = new Set(bkmRes.questionIds ?? []); items = items.filter((q: any) => ids.has(q.questionId)); }
          if (unansweredOnly && answeredRes) { const ids = new Set(answeredRes.questionIds ?? []); items = items.filter((q: any) => !ids.has(q.questionId)); }
          if (incorrectOnly && incorrectRes) { const ids = new Set(incorrectRes.questionIds ?? []); items = items.filter((q: any) => ids.has(q.questionId)); }
          if (aiVerifiedOnly) items = items.filter((q: any) => !!q.validityCheckedAt);
          setAvailableCount(items.length);
        } else if (allSelected && !aiVerifiedOnly) {
          const cached = getCached<number>(`qcount_${examType}`);
          if (cached !== null) { setAvailableCount(cached); return; }
          const qRes = await fetch(`${API_ENDPOINT}/questions?examType=${examType}`).then(r => r.json());
          const count = qRes.count ?? qRes.items?.length ?? 0;
          setCached(`qcount_${examType}`, count);
          setAvailableCount(count);
        } else {
          const qRes = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
          let countItems: any[] = qRes.items ?? [];
          if (aiVerifiedOnly) countItems = countItems.filter((q: any) => !!q.validityCheckedAt);
          setAvailableCount(aiVerifiedOnly ? countItems.length : (qRes.count ?? countItems.length));
        }
      } catch { setAvailableCount(0); }
    };
    fetchCounts();
  }, [examType, selectedDomains, user, bookmarkOnly, unansweredOnly, incorrectOnly, aiVerifiedOnly]);

  useEffect(() => {
    if (!user) { setDomainStats([]); return; }
    const cached = getCached<any[]>(`ustats_${user.userId}`);
    if (cached !== null) { setDomainStats(cached); return; }
    fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`)
      .then(r => r.json())
      .then(d => { setDomainStats(d.stats ?? []); setCached(`ustats_${user.userId}`, d.stats ?? [], SHORT_TTL); })
      .catch(() => setDomainStats([]));
  }, [user]);

  const domainRates: Record<string, number | null> = {};
  for (const d of EXAM_DOMAINS[examType]) {
    const s = domainStats.find(x => x.tagId === d);
    if (!s) { domainRates[d] = null; continue; }
    const total = s.correctCount + s.incorrectCount;
    domainRates[d] = total > 0 ? s.correctCount / total : null;
  }

  const startExercise = async () => {
    if (selectedDomains.length === 0) { alert(ja ? '出題ドメインを最低1つ選択してください' : 'Please select at least one domain'); return; }
    setExerciseLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
      let selectedItems: any[];
      if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
        const params = new URLSearchParams({ examType, withAnswers: 'true' });
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        const [qRes, bkmRes, answeredRes, incorrectRes] = await Promise.all([
          fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
          user && bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
          user && unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
          user && incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
        ]);
        let filtered: any[] = qRes.items ?? [];
        if (bookmarkOnly && bkmRes) { const ids = new Set(bkmRes.questionIds ?? []); filtered = filtered.filter((q: any) => ids.has(q.questionId)); }
        if (unansweredOnly && answeredRes) { const ids = new Set(answeredRes.questionIds ?? []); filtered = filtered.filter((q: any) => !ids.has(q.questionId)); }
        if (incorrectOnly && incorrectRes) { const ids = new Set(incorrectRes.questionIds ?? []); filtered = filtered.filter((q: any) => ids.has(q.questionId)); }
        if (aiVerifiedOnly) filtered = filtered.filter((q: any) => !!q.validityCheckedAt);
        selectedItems = shuffleArray(filtered).slice(0, limit);
      } else {
        const params = new URLSearchParams({ examType, withAnswers: 'true' });
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
        let allItems: any[] = data.items ?? [];
        if (aiVerifiedOnly) allItems = allItems.filter((q: any) => !!q.validityCheckedAt);
        selectedItems = shuffleArray(allItems).slice(0, limit);
      }
      if (selectedItems.length === 0) { alert(t('exerciseSetup.noQuestions')); setExerciseLoading(false); return; }
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exercise', examType, questionIds: selectedItems.map((q: any) => q.questionId) }),
      });
      const sessionData = await sessionRes.json();
      navigate('/exercise/session', { state: { sessionId: sessionData.sessionId, questions: selectedItems, userId, mode: 'exercise', examType } });
    } catch (err) {
      console.error(err);
      alert(t('exerciseSetup.startFailed'));
    } finally { setExerciseLoading(false); }
  };

  const resumeExercise = () => {
    if (!exerciseDraft) return;
    navigate('/exercise/session', {
      state: {
        sessionId: exerciseDraft.sessionId, questions: exerciseDraft.questions,
        userId: exerciseDraft.userId, examType: exerciseDraft.examType, mode: 'exercise',
        resumeIndex: exerciseDraft.currentIndex, resumeResults: exerciseDraft.results,
        resumeAnswered: exerciseDraft.answered, resumeSelectedAnswers: exerciseDraft.selectedAnswers,
      }
    });
  };

  // ── 模試 state ──
  const [examLoading, setExamLoading] = useState(false);
  const [examMode, setExamMode] = useState<'full' | 'mini'>('full');
  const examCfg = targetExam ? EXAM_CONFIGS[targetExam] : null;
  const examQuestions = examCfg ? (examMode === 'mini' ? Math.ceil(examCfg.totalQuestions / 5) : examCfg.totalQuestions) : 0;
  const examTimeMin = examCfg ? (examMode === 'mini' ? Math.ceil(examCfg.timeLimitMin / 5) : examCfg.timeLimitMin) : 0;
  const examRules = ja
    ? ['タイマーは開始後にカウントダウン', '正誤は全問終了後に確認', '途中で一時停止・再開が可能', 'AI確認済み問題・未回答問題のみ出題']
    : ['Timer counts down after start', 'Results shown after finishing all questions', 'You can pause and resume', 'Only AI-verified and unanswered questions'];

  const startExam = async () => {
    if (!targetExam || !examCfg) return;
    setExamLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true', withValidity: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      let items: any[] = (data.items ?? []).filter((q: any) => !!q.validityCheckedAt);
      if (user) {
        const res = await fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json());
        const answered = new Set(res.questionIds ?? []);
        items = items.filter((q: any) => !answered.has(q.questionId));
      }
      items = shuffleArray(items).slice(0, examQuestions);
      if (items.length === 0) { alert(ja ? '条件に合う問題がありません（AI確認済み・未回答問題が0件）' : 'No questions match'); setExamLoading(false); return; }
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType: targetExam, questionIds: items.map((q: any) => q.questionId) }),
      });
      const sessionData = await sessionRes.json();
      navigate('/exam/session', { state: { sessionId: sessionData.sessionId, questions: items, userId, examType: targetExam, isMini: examMode === 'mini', timeLimitMin: examTimeMin } });
    } catch (err) {
      console.error(err);
      alert(ja ? '模試の開始に失敗しました' : 'Failed to start exam');
    } finally { setExamLoading(false); }
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 'var(--font-size-base)', fontWeight: active ? 700 : 500,
    color: active ? 'var(--color-primary)' : 'var(--color-text-sub)',
    borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--spacing-lg)' }} className="page-container">

      {/* タブ */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--spacing-lg)' }}>
        <button style={tabBtn(tab === 'exercise')} onClick={() => setTab('exercise')}>
          {ja ? '演習' : 'Exercise'}
        </button>
        <button style={tabBtn(tab === 'exam')} onClick={() => setTab('exam')}>
          {ja ? '模試' : 'Mock Exam'}
        </button>
      </div>

      {/* ── カスタム演習タブ ── */}
      {tab === 'exercise' && (
        <>
          {/* 試験種別（targetExam未設定時のみ） */}
          {!targetExam && (
            <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>
                {ja ? '試験種別' : 'Exam Type'}
              </span>
              {EXAM_TYPES.map(et => (
                <button
                  key={et}
                  onClick={() => { setExamType(et); localStorage.setItem('targetExam', et); setTargetExam(et); window.dispatchEvent(new CustomEvent('targetExamChanged', { detail: et })); }}
                  style={{
                    padding: '4px 14px', border: `1px solid ${examType === et ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--border-radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer',
                    background: examType === et ? 'var(--color-primary-light)' : 'transparent',
                    color: examType === et ? 'var(--color-primary)' : 'var(--color-text-sub)',
                    fontWeight: examType === et ? 700 : 400,
                  }}
                >{et}</button>
              ))}
            </div>
          )}

          {/* ドメイン選択 */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-sm)' }}>
              {ja ? '出題ドメイン' : 'Domains'}
            </div>
            <DomainSelector
              domains={EXAM_DOMAINS[examType]}
              selected={selectedDomains}
              onChange={setSelectedDomains}
              lang={lang}
              noMargin
              weakRates={user ? domainRates : undefined}
            />
          </div>

          {/* オプション */}
          {user && (
            <div style={{ marginBottom: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                <input type="checkbox" checked={unansweredOnly} onChange={e => { setUnansweredOnly(e.target.checked); if (e.target.checked) setIncorrectOnly(false); }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                {t('exerciseSetup.unansweredOnly')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                <input type="checkbox" checked={incorrectOnly} onChange={e => { setIncorrectOnly(e.target.checked); if (e.target.checked) setUnansweredOnly(false); }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                {t('exerciseSetup.incorrectOnly')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                <input type="checkbox" checked={bookmarkOnly} onChange={e => setBookmarkOnly(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                {t('exerciseSetup.bookmarkOnly')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                <input type="checkbox" checked={aiVerifiedOnly} onChange={e => setAiVerifiedOnly(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                {ja ? 'AI確認済み問題のみ' : 'AI Verified Only'}
              </label>
            </div>
          )}

          {/* 問題数 */}
          <div style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>
              {ja ? '問題数' : 'Questions'}
            </span>
            <input
              type="number" value={limit}
              onChange={e => setLimit(Math.max(1, parseInt(e.target.value) || 1))}
              min={1} max={availableCount ?? 50}
              style={{ padding: '8px 12px', width: 80, border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', outline: 'none' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
            />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
              {availableCount !== null ? t('exerciseSetup.maxQ', { n: availableCount }) : t('exerciseSetup.loading')}
            </span>
          </div>

          {availableCount !== null && availableCount > 0 && availableCount < limit && (
            <div style={{ marginBottom: 'var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-warning)', background: 'var(--color-bg-warning)', border: '1px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px' }}>
              ⚠️ {ja ? `条件に合う問題が${availableCount}問しかありません。${availableCount}問で開始します。` : `Only ${availableCount} questions match. Session will start with ${availableCount} questions.`}
            </div>
          )}

          {hasDraft && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-md)', padding: '12px var(--spacing-md)', marginBottom: 'var(--spacing-md)', background: 'var(--color-bg-warning)', border: '1px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <span style={{ fontSize: 18 }}>⏸</span>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-warning)' }}>{t('exerciseSetup.resumeNotice')}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-warning-sub)' }}>{t('exerciseSetup.resumeNoticeDesc')}</div>
                </div>
              </div>
              {!isMobile && (
                <Button size="sm" variant="outline" onClick={resumeExercise} style={{ borderColor: 'var(--color-border-warning)', color: 'var(--color-text-warning)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {t('exerciseSetup.resume')} →
                </Button>
              )}
            </div>
          )}

          {!isMobile && (
            <>
              {!user && (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 6, textAlign: 'center' }}>
                  {ja ? '※ ログインすると結果が保存されます' : '* Log in to save your results'}
                </div>
              )}
              <Button variant="primary" fullWidth onClick={startExercise} disabled={exerciseLoading || availableCount === 0}>
                {exerciseLoading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                    {t('exerciseSetup.starting')}
                  </span>
                ) : t('exerciseSetup.start')}
              </Button>
            </>
          )}
        </>
      )}

      {/* ── 模試タブ ── */}
      {tab === 'exam' && (
        <>
          {!targetExam ? (
            <div style={{ padding: 24, background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', textAlign: 'center' }}>
              {ja ? 'サイドメニューから試験を選択してください' : 'Select your target exam from the sidebar'}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginBottom: 16 }}>{examCfg?.fullName}</div>

              {/* ミニ模試チェックボックス */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)', marginBottom: 20 }}>
                <input
                  type="checkbox"
                  checked={examMode === 'mini'}
                  onChange={e => setExamMode(e.target.checked ? 'mini' : 'full')}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                {ja ? 'ミニ模試（問題数・時間を1/5に短縮）' : 'Mini mode (1/5 questions & time)'}
              </label>

              <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '問題数' : 'Questions'}</div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{examQuestions}<span style={{ fontSize: 12, fontWeight: 400 }}>{ja ? '問' : ' Q'}</span></div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '制限時間' : 'Time Limit'}</div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{examTimeMin}<span style={{ fontSize: 12, fontWeight: 400 }}>{ja ? '分' : ' min'}</span></div>
                </div>
                {examMode === 'full' && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '合格点' : 'Pass Score'}</div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{PASS_SCORES[targetExam]}</div>
                  </div>
                )}
              </div>
              <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>{ja ? 'ルール' : 'Rules'}</div>
                {examRules.map((r, i) => (
                  <div key={i} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: i < examRules.length - 1 ? 4 : 0 }}>
                    <span style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 1 }}>•</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
              {!isMobile && (
                <Button variant="primary" fullWidth onClick={startExam} disabled={examLoading}>
                  {examLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                      {ja ? '準備中...' : 'Preparing...'}
                    </span>
                  ) : (ja ? '模試を開始する' : 'Start Mock Exam')}
                </Button>
              )}
            </>
          )}
        </>
      )}

      {/* ── モバイル固定底バー（演習） ── */}
      {isMobile && tab === 'exercise' && (
        <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, background: 'var(--color-bg-white)', borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', gap: 6, boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}>
          {hasDraft ? (
            <>
              <Button variant="primary" style={{ flex: 2, minWidth: 0, height: 44, gap: 6 }} onClick={resumeExercise}>
                {ja ? '続きから再開' : 'Resume'}<IconCirclePause size={17} />
              </Button>
              <Button variant="outline" style={{ flex: 1, minWidth: 0, height: 44, gap: 6 }} onClick={startExercise} disabled={exerciseLoading || availableCount === 0}>
                {exerciseLoading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                    {t('exerciseSetup.starting')}
                  </span>
                ) : <>{ja ? '演習を開始' : 'New'}<IconCirclePlay size={17} /></>}
              </Button>
            </>
          ) : (
            <Button variant="primary" style={{ flex: 1, minWidth: 0, height: 44, gap: 6 }} onClick={startExercise} disabled={exerciseLoading || availableCount === 0}>
              {exerciseLoading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                  {t('exerciseSetup.starting')}
                </span>
              ) : <>{t('exerciseSetup.start')}<IconCirclePlay size={17} /></>}
            </Button>
          )}
        </div>
      )}

      {/* ── モバイル固定底バー（模試） ── */}
      {isMobile && tab === 'exam' && targetExam && (
        <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, background: 'var(--color-bg-white)', borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}>
          <Button variant="primary" style={{ flex: 1, minWidth: 0, height: 44, gap: 6 }} onClick={startExam} disabled={examLoading}>
            {examLoading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                {ja ? '準備中...' : 'Preparing...'}
              </span>
            ) : <>{ja ? '模試を開始する' : 'Start Mock Exam'}<IconCirclePlay size={17} /></>}
          </Button>
        </div>
      )}
    </div>
  );
}
