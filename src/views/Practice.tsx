'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { API_ENDPOINT, EXAM_CONFIGS, EXAM_DOMAINS, EXAM_TYPES, PASS_SCORES, qDomainName } from '../constants';
import Button from '../components/ui/Button';
import DomainSelector from '../components/DomainSelector';
import { getCached, setCached, SHORT_TTL } from '../utils/cache';
import { autoScoreAndClearDrafts } from '../utils/sessionUtils';
import { animateLoadPct, randomPlateau } from '../utils/loadProgress';
import { IconChevronUp, IconChevronDown, IconChevronRight } from '../components/Icons';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const loadExercisePrefs = (et: string, uid: string) => {
  try { return JSON.parse(localStorage.getItem(`exercisePrefs_${uid}`) ?? '{}')[et] ?? {}; } catch { return {}; }
};
const saveExercisePrefs = (et: string, uid: string, prefs: object) => {
  try {
    const stored = JSON.parse(localStorage.getItem(`exercisePrefs_${uid}`) ?? '{}');
    stored[et] = prefs;
    localStorage.setItem(`exercisePrefs_${uid}`, JSON.stringify(stored));
  } catch {}
};

type Tab = 'exercise' | 'exam';

export default function Practice() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const ja = lang === 'ja';
  const uid = user?.userId ?? 'guest';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const [tab, setTab] = useState<Tab>('exercise');
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(`targetExam_${uid}`));

  useEffect(() => {
    const handler = (e: Event) => {
      const et = (e as CustomEvent).detail;
      setTargetExam(et);
      setExamType(et);
    };
    window.addEventListener('targetExamChanged', handler);
    return () => window.removeEventListener('targetExamChanged', handler);
  }, []);

  // ── カスタム演習 state ──
  const [examType, setExamType] = useState<string>(() =>
    localStorage.getItem(`targetExam_${uid}`) || 'SAA'
  );
  const initPrefs = (et: string) => loadExercisePrefs(et, uid);
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => {
    const et = localStorage.getItem(`targetExam_${uid}`) || 'SAA';
    return initPrefs(et).domains ?? EXAM_DOMAINS[et] ?? [];
  });
  const [limit, setLimit] = useState<number>(() => {
    const raw = initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').limit ?? 10;
    return Math.max(5, Math.round(raw / 5) * 5);
  });
  const [bookmarkOnly, setBookmarkOnly] = useState<boolean>(() => initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').bookmarkOnly ?? false);
  const [unansweredOnly, setUnansweredOnly] = useState<boolean>(() => initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').unansweredOnly ?? false);
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(() => initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').incorrectOnly ?? false);
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [exerciseLoading, setExerciseLoading] = useState(false);
  const [exerciseLoadPct, setExerciseLoadPct] = useState(0);
  type DomainStat = { tagId: string; correctCount: number; incorrectCount: number };
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);

  const [exerciseDraft, setExerciseDraft] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem(`practiceExerciseDraft_${uid}`) ?? 'null'); } catch { return null; }
  });
  const hasDraft = exerciseDraft?.examType === examType;
  const [examDraft, setExamDraft] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem(`examDraft_${uid}`) ?? 'null'); } catch { return null; }
  });
  const hasExamDraft = examDraft?.examType === examType;
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [showNewExamPanel, setShowNewExamPanel] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showExerciseOptions, setShowExerciseOptions] = useState(false);
  const [showExamOptions, setShowExamOptions] = useState(false);
  // 模試用フィルタ
  const [examUnansweredOnly, setExamUnansweredOnly] = useState(false);
  const [examIncorrectOnly, setExamIncorrectOnly] = useState(false);
  const [examBookmarkOnly, setExamBookmarkOnly] = useState(false);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const prefs = loadExercisePrefs(examType, uid);
    setSelectedDomains(prefs.domains ?? EXAM_DOMAINS[examType]);
    setLimit(prefs.limit ?? 10);
    setBookmarkOnly(prefs.bookmarkOnly ?? false);
    setUnansweredOnly(prefs.unansweredOnly ?? false);
    setIncorrectOnly(prefs.incorrectOnly ?? false);
  }, [examType]);

  useEffect(() => {
    saveExercisePrefs(examType, uid, { domains: selectedDomains, limit, bookmarkOnly, unansweredOnly, incorrectOnly });
  }, [examType, selectedDomains, limit, bookmarkOnly, unansweredOnly, incorrectOnly]);


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
          
          setAvailableCount(items.length);
        } else if (allSelected) {
          const cached = getCached<number>(`qcount_${examType}`);
          if (cached !== null) { setAvailableCount(cached); return; }
          const qRes = await fetch(`${API_ENDPOINT}/questions?examType=${examType}`).then(r => r.json());
          const count = qRes.count ?? qRes.items?.length ?? 0;
          setCached(`qcount_${examType}`, count);
          setAvailableCount(count);
        } else {
          const qRes = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
          setAvailableCount(qRes.count ?? (qRes.items ?? []).length);
        }
      } catch { setAvailableCount(0); }
    };
    fetchCounts();
  }, [examType, selectedDomains, user, bookmarkOnly, unansweredOnly, incorrectOnly]);

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
    const userId = user?.userId ?? 'guest';
    await autoScoreAndClearDrafts(userId);
    setExerciseDraft(null);
    setExamDraft(null);
    setExerciseLoading(true);
    setExerciseLoadPct(10);
    try {
      const userId = user?.userId ?? 'guest';
      const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
      // ── プログレッシブロードパス（フィルタあり・なし共通）──
      // 1. IDのみ取得（Lambda側でフィルタ・優先度ソート）
      const idsParams = new URLSearchParams({ examType, shuffle: 'true', idsOnly: 'true' });
      if (!allSelected) idsParams.set('domain', selectedDomains.join(','));
      if (user && bookmarkOnly)   idsParams.set('bookmarkOnly',  'true');
      if (user && unansweredOnly) idsParams.set('unansweredOnly', 'true');
      if (user && incorrectOnly)  idsParams.set('incorrectOnly',  'true');
      if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) idsParams.set('userId', userId);
      const idsData = await fetch(`${API_ENDPOINT}/questions?${idsParams}`).then(r => r.json());
      const allIds: string[] = idsData.questionIds ?? [];
      const selectedIds = allIds.slice(0, limit);
      if (selectedIds.length === 0) { alert(t('exerciseSetup.noQuestions')); setExerciseLoading(false); return; }
      setExerciseLoadPct(50);
      // 2. セッション作成 + 最初の1問取得 を並列実行
      const [sessionData, q1Data] = await Promise.all([
        fetch(`${API_ENDPOINT}/sessions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, mode: 'exercise', examType, questionIds: selectedIds }),
        }).then(r => r.json()),
        fetch(`${API_ENDPOINT}/questions?ids=${selectedIds[0]}&withAnswers=true`).then(r => r.json()),
      ]);
      setExerciseLoadPct(90);
      // 3. 最初の1問で即遷移（2問目以降は ExerciseSession 内でバックグラウンドロード）
      navigate('/aws/exercise/session', {
        state: {
          sessionId: sessionData.sessionId,
          questions: q1Data.items ?? [],
          questionIds: selectedIds,
          userId, mode: 'exercise', examType,
        },
      });
    } catch (err) {
      console.error(err);
      alert(t('exerciseSetup.startFailed'));
    } finally { setExerciseLoading(false); setExerciseLoadPct(0); }
  };

  const resumeExercise = () => {
    if (!exerciseDraft) return;
    navigate('/aws/exercise/session', {
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
  const [examLoadPct, setExamLoadPct] = useState(0);
  const [examMode, setExamMode] = useState<'full' | 'mini'>('full');
  const examCfg = targetExam ? EXAM_CONFIGS[targetExam] : null;
  const examQuestions = examCfg ? (examMode === 'mini' ? Math.ceil(examCfg.totalQuestions / 5) : examCfg.totalQuestions) : 0;
  const examTimeMin = examCfg ? (examMode === 'mini' ? Math.ceil(examCfg.timeLimitMin / 5) : examCfg.timeLimitMin) : 0;
  const examRules = ja
    ? ['タイマーは開始後にカウントダウン', '正誤は全問終了後に確認', '途中で一時停止・再開が可能', 'AI確認済み問題を対象・未回答問題を優先出題']
    : ['Timer counts down after start', 'Results shown after finishing all questions', 'You can pause and resume', 'AI-verified questions; unanswered ones prioritized'];

  const resumeExam = () => {
    if (!examDraft) return;
    navigate('/aws/exam/session', {
      state: {
        sessionId: examDraft.sessionId,
        questions: examDraft.questions,
        userId: examDraft.userId,
        examType: examDraft.examType,
        isMini: examDraft.isMini ?? false,
        resumeIndex: examDraft.currentIndex,
        resumeAnswers: examDraft.answers,
        resumeTimeLeft: examDraft.timeLeft,
      }
    });
  };

  const startExam = async () => {
    if (!targetExam || !examCfg) return;
    const userId = user?.userId ?? 'guest';
    await autoScoreAndClearDrafts(userId);
    setExerciseDraft(null);
    setExamDraft(null);
    setExamLoading(true);
    setExamLoadPct(10);
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true' });
      const plateau = randomPlateau();
      const stopAnim = animateLoadPct(setExamLoadPct, 10, plateau);
      const needFilter = user && (examUnansweredOnly || examIncorrectOnly || examBookmarkOnly);
      const [data, answeredRes, incorrectRes, bkmRes] = await Promise.all([
        fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
        user ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : Promise.resolve(null),
        needFilter && examIncorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : Promise.resolve(null),
        needFilter && examBookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
      ]);
      stopAnim();
      setExamLoadPct(plateau);
      let items: any[] = (data.items ?? []).filter((q: any) => !!q.validityCheckedAt);
      items = shuffleArray(items);
      if (needFilter) {
        if (examUnansweredOnly && answeredRes) { const ids = new Set<string>(answeredRes.questionIds ?? []); items = items.filter((q: any) => !ids.has(q.questionId)); }
        if (examIncorrectOnly && incorrectRes) { const ids = new Set<string>(incorrectRes.questionIds ?? []); items = items.filter((q: any) => ids.has(q.questionId)); }
        if (examBookmarkOnly && bkmRes) { const ids = new Set<string>(bkmRes.questionIds ?? []); items = items.filter((q: any) => ids.has(q.questionId)); }
      } else if (answeredRes) {
        const answered = new Set<string>(answeredRes.questionIds ?? []);
        items.sort((a: any, b: any) => (answered.has(a.questionId) ? 1 : 0) - (answered.has(b.questionId) ? 1 : 0));
      }
      items = items.slice(0, examQuestions);
      if (items.length === 0) { alert(ja ? '条件に合う問題がありません' : 'No questions match'); setExamLoading(false); return; }
      setExamLoadPct(90);
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType: targetExam, questionIds: items.map((q: any) => q.questionId) }),
      });
      const sessionData = await sessionRes.json();
      navigate('/aws/exam/session', { state: { sessionId: sessionData.sessionId, questions: items, userId, examType: targetExam, isMini: examMode === 'mini', timeLimitMin: examTimeMin } });
    } catch (err) {
      console.error(err);
      alert(ja ? '模試の開始に失敗しました' : 'Failed to start exam');
    } finally { setExamLoading(false); setExamLoadPct(0); }
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 'var(--font-size-base)', fontWeight: active ? 700 : 500,
    color: active ? 'var(--color-primary)' : 'var(--color-text-sub)',
    borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-lg)', paddingBottom: isMobile ? 'var(--spacing-lg)' : 80 }} className="page-container">
      <Helmet>
        <title>練習 | 無限ノック</title>
        <meta name="description" content="AWS認定試験の練習問題に取り組もう。苦手分野を集中的に練習して合格スコアを目指そう。" />
      </Helmet>


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
          {!targetExam ? (
            <div style={{ padding: 24, background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', textAlign: 'center' }}>
              {ja
                ? (isMobile ? '上部メニューから試験を選択してください' : '左のメニューから試験を選択してください')
                : (isMobile ? 'Select your target exam from the top menu' : 'Select your target exam from the left sidebar')}
            </div>
          ) : (<>
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

          {/* 問題数 */}
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', display: 'block', marginBottom: 8 }}>
              {ja ? '問題数' : 'Questions'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button
                onClick={() => setLimit(v => Math.max(5, v - 5))}
                disabled={limit <= 5}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid color-mix(in srgb, var(--color-text-light) 70%, transparent)', background: 'transparent', cursor: limit <= 5 ? 'default' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: limit <= 5 ? 'var(--color-text-light)' : 'var(--color-text-main)' }}
              >−</button>
              <span style={{ fontSize: 24, fontWeight: 800, minWidth: 64, textAlign: 'center', color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {limit}<span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2, color: 'var(--color-text-sub)' }}>{ja ? '問' : 'Q'}</span>
              </span>
              <button
                onClick={() => setLimit(v => Math.min(examCfg?.totalQuestions ?? 65, v + 5))}
                disabled={limit >= (examCfg?.totalQuestions ?? 65)}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--color-text-light)', background: 'transparent', cursor: limit >= (examCfg?.totalQuestions ?? 65) ? 'default' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: limit >= (examCfg?.totalQuestions ?? 65) ? 'var(--color-text-light)' : 'var(--color-text-main)' }}
              >+</button>
            </div>
          </div>

          {availableCount !== null && availableCount > 0 && availableCount < limit && (
            <div style={{ marginBottom: 'var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-warning)', background: 'var(--color-bg-warning)', border: '1px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px' }}>
              ⚠️ {ja ? `条件に合う問題が${availableCount}問しかありません。${availableCount}問で開始します。` : `Only ${availableCount} questions match. Session will start with ${availableCount} questions.`}
            </div>
          )}

          {/* ── オプション（折りたたみ） ── */}
          {user && (
            <div style={{ marginBottom: 'var(--spacing-lg)', border: '1px solid color-mix(in srgb, var(--color-text-light) 70%, transparent)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
              <button
                onClick={() => setShowExerciseOptions(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'var(--color-bg-main)', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-sub)' }}
              >
                {showExerciseOptions ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                {ja ? 'オプション' : 'Options'}
                {(unansweredOnly || incorrectOnly || bookmarkOnly) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                    {[unansweredOnly, incorrectOnly, bookmarkOnly].filter(Boolean).length}
                  </span>
                )}
              </button>
              {showExerciseOptions && (
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--color-border)' }}>
                  {([
                    ['unansweredOnly', ja ? '未回答を優先' : 'Unanswered First', ja ? '未回答の問題を優先して出題（不足時は既回答も含む）' : 'Prioritize unanswered questions'],
                    ['incorrectOnly',  ja ? '不正解を優先' : 'Incorrect First',  ja ? '不正解だった問題を優先して出題（不足時は他も含む）' : 'Prioritize previously incorrect questions'],
                    ['bookmarkOnly',   ja ? 'ブックマークを優先' : 'Bookmarked First', ja ? 'ブックマークした問題を優先して出題（不足時は他も含む）' : 'Prioritize bookmarked questions'],
                  ] as [string, string, string][]).map(([key, label, desc]) => {
                    const stateMap: Record<string, boolean> = { unansweredOnly, incorrectOnly, bookmarkOnly };
                    const setterMap: Record<string, (v: boolean) => void> = {
                      unansweredOnly: v => { setUnansweredOnly(v); if (v) setIncorrectOnly(false); },
                      incorrectOnly:  v => { setIncorrectOnly(v);  if (v) setUnansweredOnly(false); },
                      bookmarkOnly:   setBookmarkOnly,
                    };
                    const on = stateMap[key];
                    return (
                      <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={e => setterMap[key](e.target.checked)}
                          style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, accentColor: 'var(--color-primary)' }} />
                        <div>
                          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: on ? 600 : 400, color: 'var(--color-text-main)' }}>{label}</div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 1 }}>{desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          </>)}
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

              {/* ── オプション（模試・折りたたみ） ── */}
              {user && (
                <div style={{ marginBottom: 'var(--spacing-lg)', border: '1px solid color-mix(in srgb, var(--color-text-light) 70%, transparent)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setShowExamOptions(v => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'var(--color-bg-main)', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-sub)' }}
                  >
                    {showExamOptions ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    {ja ? 'オプション' : 'Options'}
                    {(examUnansweredOnly || examIncorrectOnly || examBookmarkOnly) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                        {[examUnansweredOnly, examIncorrectOnly, examBookmarkOnly].filter(Boolean).length}
                      </span>
                    )}
                  </button>
                  {showExamOptions && (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--color-border)' }}>
                      {([
                        ['examUnansweredOnly', ja ? '未回答を優先' : 'Unanswered First', ja ? '未回答の問題を優先して出題（不足時は既回答も含む）' : 'Prioritize unanswered questions'],
                        ['examIncorrectOnly',  ja ? '不正解を優先' : 'Incorrect First',  ja ? '不正解だった問題を優先して出題（不足時は他も含む）' : 'Prioritize previously incorrect questions'],
                        ['examBookmarkOnly',   ja ? 'ブックマークを優先' : 'Bookmarked First', ja ? 'ブックマークした問題を優先して出題（不足時は他も含む）' : 'Prioritize bookmarked questions'],
                      ] as [string, string, string][]).map(([key, label, desc]) => {
                        const stateMap: Record<string, boolean> = { examUnansweredOnly, examIncorrectOnly, examBookmarkOnly };
                        const setterMap: Record<string, (v: boolean) => void> = {
                          examUnansweredOnly: v => { setExamUnansweredOnly(v); if (v) setExamIncorrectOnly(false); },
                          examIncorrectOnly:  v => { setExamIncorrectOnly(v);  if (v) setExamUnansweredOnly(false); },
                          examBookmarkOnly:   setExamBookmarkOnly,
                        };
                        const on = stateMap[key];
                        return (
                          <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                            <input type="checkbox" checked={on} onChange={e => setterMap[key](e.target.checked)}
                              style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, accentColor: 'var(--color-primary)' }} />
                            <div>
                              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: on ? 600 : 400, color: 'var(--color-text-main)' }}>{label}</div>
                              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 1 }}>{desc}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── 固定底バー（演習） ── */}
      {tab === 'exercise' && (
        <>
          {hasDraft && showNewPanel && isMobile && (
            <>
              <div onClick={() => setShowNewPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 210 }} />
              <div style={{ position: 'fixed', bottom: 116, left: 0, right: 0, zIndex: 211, background: 'var(--color-bg-white)', borderRadius: '14px 14px 0 0', padding: '14px 0 12px', boxShadow: '0 -4px 20px rgba(0,0,0,0.18)', animation: 'slideUp 0.22s ease' }}>
              <div style={{ padding: '0 var(--spacing-lg)' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', textAlign: 'center', marginBottom: 10 }}>
                  {ja ? 'セッションを上書きして開始します' : 'This will overwrite the current session'}
                </div>
                <Button variant="outline" fullWidth style={{ height: 44 }}
                  onClick={() => { setShowNewPanel(false); startExercise(); }}>
                  {ja ? '新規に開始' : 'Start New'}
                </Button>
              </div>
              </div>
            </>
          )}
          {isMobile ? (
            /* モバイル：ホーム画面と同じスタイルの固定バー */
            <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, background: 'var(--color-bg-white)', borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', gap: 6, boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}>
              {hasDraft ? (
                <div style={{ flex: 1, display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden', opacity: availableCount === 0 ? 0.5 : 1 }}>
                  <button
                    disabled={exerciseLoading || availableCount === 0}
                    onClick={resumeExercise}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (exerciseLoading || availableCount === 0) ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {exerciseLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                        {ja ? `準備中... ${exerciseLoadPct}%` : `Loading... ${exerciseLoadPct}%`}
                      </span>
                    ) : (ja ? '試験を再開' : 'Resume')}
                  </button>
                  <button
                    onClick={() => setShowNewPanel(v => !v)}
                    style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label={ja ? '新規で開始' : 'Start new'}
                  >
                    <IconChevronUp size={16} />
                  </button>
                </div>
              ) : (
                <button
                  disabled={exerciseLoading || availableCount === 0}
                  onClick={startExercise}
                  style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (exerciseLoading || availableCount === 0) ? 'default' : 'pointer', opacity: availableCount === 0 ? 0.5 : 1 }}
                >
                  {exerciseLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                      {ja ? `準備中... ${exerciseLoadPct}%` : `Loading... ${exerciseLoadPct}%`}
                    </span>
                  ) : (ja ? '試験を開始' : 'Start')}
                </button>
              )}
            </div>
          ) : (
            /* デスクトップ：従来のスタイル */
            <div style={{ position: 'fixed', bottom: 16, left: 'var(--content-left, 0px)', right: 0, zIndex: 150 }}>
            <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 var(--spacing-lg)', display: 'flex', gap: 6 }}>
              {hasDraft ? (
                <div style={{ flex: 1, display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden', opacity: availableCount === 0 ? 0.5 : 1 }}>
                  <button
                    disabled={exerciseLoading || availableCount === 0}
                    onClick={resumeExercise}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (exerciseLoading || availableCount === 0) ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {exerciseLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                        {ja ? `準備中... ${exerciseLoadPct}%` : `Loading... ${exerciseLoadPct}%`}
                      </span>
                    ) : (ja ? '試験を再開' : 'Resume')}
                  </button>
                  <button
                    onClick={startExercise}
                    style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label={ja ? '新規で開始' : 'Start new'}
                  >
                    <IconChevronUp size={16} />
                  </button>
                </div>
              ) : (
                <button
                  disabled={exerciseLoading || availableCount === 0}
                  onClick={startExercise}
                  style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (exerciseLoading || availableCount === 0) ? 'default' : 'pointer', opacity: availableCount === 0 ? 0.5 : 1 }}
                >
                  {exerciseLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                      {ja ? `準備中... ${exerciseLoadPct}%` : `Loading... ${exerciseLoadPct}%`}
                    </span>
                  ) : (ja ? '試験を開始' : 'Start')}
                </button>
              )}
            </div>
            </div>
          )}
        </>
      )}

      {/* ── 固定底バー（模試） ── */}
      {tab === 'exam' && targetExam && (
        <>
          {/* 新規開始確認パネル（ドラフトあり時） */}
          {hasExamDraft && showNewExamPanel && isMobile && (
            <>
              <div onClick={() => setShowNewExamPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 210 }} />
              <div style={{ position: 'fixed', bottom: 116, left: 0, right: 0, zIndex: 211, background: 'var(--color-bg-white)', borderRadius: '14px 14px 0 0', padding: '14px 0 12px', boxShadow: '0 -4px 20px rgba(0,0,0,0.18)', animation: 'slideUp 0.22s ease' }}>
              <div style={{ padding: '0 var(--spacing-lg)' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', textAlign: 'center', marginBottom: 10 }}>
                  {ja ? 'セッションを上書きして開始します' : 'This will overwrite the current session'}
                </div>
                <Button variant="outline" fullWidth style={{ height: 44 }}
                  onClick={() => { setShowNewExamPanel(false); startExam(); }}>
                  {ja ? '新規に開始' : 'Start New'}
                </Button>
              </div>
              </div>
            </>
          )}
{isMobile ? (
            /* モバイル：ホーム画面と同じスタイルの固定バー */
            <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, background: 'var(--color-bg-white)', borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', gap: 6, boxShadow: '0 -2px 8px rgba(0,0,0,0.08)' }}>
              {hasExamDraft ? (
                <div style={{ flex: 1, display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden' }}>
                  <button
                    disabled={examLoading}
                    onClick={resumeExam}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: examLoading ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {examLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                        {ja ? `準備中... ${examLoadPct}%` : `Preparing... ${examLoadPct}%`}
                      </span>
                    ) : (ja ? '試験を再開' : 'Resume')}
                  </button>
                  <button
                    onClick={() => setShowNewExamPanel(v => !v)}
                    style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label={ja ? '新規で試験を開始' : 'Start new exam'}
                  >
                    <IconChevronUp size={16} />
                  </button>
                </div>
              ) : (
                <button
                  disabled={examLoading}
                  onClick={startExam}
                  style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: examLoading ? 'default' : 'pointer' }}
                >
                  {examLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                      {ja ? `準備中... ${examLoadPct}%` : `Preparing... ${examLoadPct}%`}
                    </span>
                  ) : (ja ? `試験を開始${examMode === 'mini' ? '（ミニ）' : ''}` : `Start${examMode === 'mini' ? ' Mini' : ''} Exam`)}
                </button>
              )}
            </div>
          ) : (
            /* デスクトップ：従来のスタイル */
            <div style={{ position: 'fixed', bottom: 16, left: 'var(--content-left, 0px)', right: 0, zIndex: 150 }}>
            <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 var(--spacing-lg)', display: 'flex' }}>
              {hasExamDraft ? (
                <div style={{ flex: 1, display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden' }}>
                  <button
                    disabled={examLoading}
                    onClick={resumeExam}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: examLoading ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {examLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                        {ja ? `準備中... ${examLoadPct}%` : `Preparing... ${examLoadPct}%`}
                      </span>
                    ) : (ja ? '試験を再開' : 'Resume')}
                  </button>
                  <button
                    onClick={startExam}
                    style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label={ja ? '新規で試験を開始' : 'Start new exam'}
                  >
                    <IconChevronUp size={16} />
                  </button>
                </div>
              ) : (
                <button
                  disabled={examLoading}
                  onClick={startExam}
                  style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: examLoading ? 'default' : 'pointer' }}
                >
                  {examLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                      {ja ? `準備中... ${examLoadPct}%` : `Preparing... ${examLoadPct}%`}
                    </span>
                  ) : (ja ? '試験を開始' : 'Start Mock Exam')}
                </button>
              )}
            </div>
            </div>
          )}
        </>
      )}

      {/* ── 開始確認モーダル ── */}
      {showStartConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 20px', width: '100%', maxWidth: 360, boxShadow: 'var(--box-shadow-md)' }}>
            <p style={{ margin: '0 0 20px', fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', lineHeight: 1.6 }}>
              {ja ? '現在の演習セッションを上書きして新しく始めます。よろしいですか？' : 'This will overwrite the current session. Continue?'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" style={{ flex: 1 }} onClick={() => setShowStartConfirm(false)}>
                {ja ? 'キャンセル' : 'Cancel'}
              </Button>
              <Button variant="primary" style={{ flex: 1 }} onClick={() => { setShowStartConfirm(false); startExercise(); }}>
                {ja ? '開始する' : 'Start'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {(exerciseLoading || examLoading) && <div style={{ position: 'fixed', inset: 0, zIndex: 9000, cursor: 'wait' }} onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} />}
    </div>
  );
}
