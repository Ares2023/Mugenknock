'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { API_ENDPOINT, EXAM_CONFIGS, EXAM_DOMAINS, EXAM_TYPES, PASS_SCORES, qDomainName, domainsToIndices, storedDomainsToNames, tagIdMatches } from '../constants';
import Button from '../components/ui/Button';
import PageLayout from '../components/ui/PageLayout';
import { getGuestAnsweredIds, getGuestIncorrectIds, getGuestBookmarkIds } from '../utils/guestProgress';
import { getCached, setCached, SHORT_TTL, getCachedPersist, setCachedPersist } from '../utils/cache';
import { autoScoreAndClearDrafts } from '../utils/sessionUtils';
import { hydrateDraftsFromServer } from '../utils/sessionResume';
import { animateLoadPct, randomPlateau } from '../utils/loadProgress';
import { getPrefetchA, getPrefetchC, prefetchTypeA } from '../utils/questionPrefetch';
import { IconChevronUp, IconChevronDown, IconChevronRight } from '../components/Icons';
import KeyHint from '../components/KeyHint';

const fmtSec = (sec: number) => `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

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
  const { user, loading: authLoading } = useAuth();
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
    if (authLoading) return;
    const saved = localStorage.getItem(`targetExam_${uid}`);
    if (saved) { setTargetExam(saved); setExamType(saved); }
  }, [uid, authLoading]);

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
    const saved = initPrefs(et).domains;
    return storedDomainsToNames(et, saved);
  });
  const [limit, setLimit] = useState<number>(() => {
    const raw = initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').limit ?? 10;
    return Math.max(5, Math.round(raw / 5) * 5);
  });
  const [bookmarkOnly, setBookmarkOnly] = useState<boolean>(() => initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').bookmarkOnly ?? false);
  const [unansweredOnly, setUnansweredOnly] = useState<boolean>(() => initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').unansweredOnly ?? false);
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(() => initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').incorrectOnly ?? false);
  const [strikeEnabled, setStrikeEnabled] = useState<boolean>(() => initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').strikeEnabled === true);
  const [hideColumn, setHideColumn] = useState<boolean>(() => initPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA').hideColumn === true);
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
  // 別端末/キャッシュ削除でもサーバ保存分から再開できるよう、起動時にドラフトを補完して再読込
  useEffect(() => {
    if (!user) return;
    hydrateDraftsFromServer(user.userId).then(h => {
      if (!h) return;
      try { setExerciseDraft(JSON.parse(localStorage.getItem(`practiceExerciseDraft_${user.userId}`) ?? 'null')); } catch {}
      try { setExamDraft(JSON.parse(localStorage.getItem(`examDraft_${user.userId}`) ?? 'null')); } catch {}
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [showNewExamPanel, setShowNewExamPanel] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showExerciseOptions, setShowExerciseOptions] = useState(false);
  // 模試用フィルタ
  const [examUnansweredOnly, setExamUnansweredOnly] = useState(false);
  const [examIncorrectOnly, setExamIncorrectOnly] = useState(false);
  const [examBookmarkOnly, setExamBookmarkOnly] = useState(false);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const prefs = loadExercisePrefs(examType, uid);
    setSelectedDomains(storedDomainsToNames(examType, prefs.domains));
    setLimit(prefs.limit ?? 10);
    setBookmarkOnly(prefs.bookmarkOnly ?? false);
    setUnansweredOnly(prefs.unansweredOnly ?? false);
    setIncorrectOnly(prefs.incorrectOnly ?? false);
    setStrikeEnabled(prefs.strikeEnabled === true);
    setHideColumn(prefs.hideColumn === true);
  }, [examType]);

  useEffect(() => {
    saveExercisePrefs(examType, uid, { domains: domainsToIndices(examType, selectedDomains), limit, bookmarkOnly, unansweredOnly, incorrectOnly, strikeEnabled, hideColumn });
  }, [examType, selectedDomains, limit, bookmarkOnly, unansweredOnly, incorrectOnly, strikeEnabled]);

  // 画面表示中にキャッシュを事前ウォームアップ
  useEffect(() => {
    if (!getPrefetchA(examType)) prefetchTypeA(examType, uid);
  }, [examType, uid]);


  useEffect(() => {
    setAvailableCount(null);
    const fetchCounts = async () => {
      if (selectedDomains.length === 0) { setAvailableCount(null); return; }
      try {
        const params = new URLSearchParams({ examType, metaOnly: 'true' });
        const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
        if (!allSelected) params.set('domain', domainsToIndices(examType, selectedDomains).join(','));
        if (bookmarkOnly || unansweredOnly || incorrectOnly) {
          const qRes = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
          let items: any[] = qRes.items ?? [];
          if (user) {
            // ログイン: サーバのブックマーク/回答済み/誤答セットで絞る
            const [bkmRes, answeredRes, incorrectRes] = await Promise.all([
              bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${user.userId}`).then(r => r.json()) : Promise.resolve(null),
              unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${user.userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
              incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${user.userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
            ]);
            if (bookmarkOnly && bkmRes) { const ids = new Set(bkmRes.questionIds ?? []); items = items.filter((q: any) => ids.has(q.questionId)); }
            if (unansweredOnly && answeredRes) { const ids = new Set(answeredRes.questionIds ?? []); items = items.filter((q: any) => !ids.has(q.questionId)); }
            if (incorrectOnly && incorrectRes) { const ids = new Set(incorrectRes.questionIds ?? []); items = items.filter((q: any) => ids.has(q.questionId)); }
          } else {
            // ゲスト: ローカルのセットで絞る
            if (bookmarkOnly) { const ids = getGuestBookmarkIds(); items = items.filter((q: any) => ids.has(q.questionId)); }
            if (unansweredOnly) { const ids = getGuestAnsweredIds(examType); items = items.filter((q: any) => !ids.has(q.questionId)); }
            if (incorrectOnly) { const ids = getGuestIncorrectIds(examType); items = items.filter((q: any) => ids.has(q.questionId)); }
          }
          setAvailableCount(items.length);
        } else if (allSelected) {
          const cached = getCached<number>(`qcount_${examType}`);
          if (cached !== null) { setAvailableCount(cached); return; }
          const qRes = await fetch(`${API_ENDPOINT}/questions?examType=${examType}&metaOnly=true`).then(r => r.json());
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
  (EXAM_DOMAINS[examType] ?? []).forEach((d, idx) => {
    const s = domainStats.find(x => tagIdMatches(x.tagId, examType, idx));
    if (!s) { domainRates[d] = null; return; }
    const total = s.correctCount + s.incorrectCount;
    domainRates[d] = total > 0 ? s.correctCount / total : null;
  });

  const startExercise = async () => {
    const userId = user?.userId ?? 'guest';
    await autoScoreAndClearDrafts(userId, [`practiceExerciseDraft_${userId}`]);
    setExerciseDraft(null);
    setExamDraft(null);
    setExerciseLoading(true);
    setExerciseLoadPct(10);
    try {
      if (selectedDomains.length === 0) { alert(ja ? '出題ドメインを1つ以上選択してください' : 'Please select at least one domain'); return; }
      const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));

      // ── プリフェッチキャッシュを使用 ──
      const hasFilters = !!(user && (bookmarkOnly || unansweredOnly || incorrectOnly)) || !allSelected;
      // 未回答/不正解/ブックマークの「優先」フィルタ。これで設定の問題数に満たない場合は
      // 同一ドメイン内のフィルタ外の問題で不足分を補充する（ドメイン選択自体は尊重する）
      const hasStatusFilter = !!(user && (bookmarkOnly || unansweredOnly || incorrectOnly));
      const isGuest = !user;
      const statusFiltersOn = bookmarkOnly || unansweredOnly || incorrectOnly;
      const qPrefs = { unansweredOnly, incorrectOnly, bookmarkOnly, domains: allSelected ? [] : selectedDomains };
      const cached = hasFilters ? getPrefetchC(examType, userId, qPrefs) : getPrefetchA(examType);
      if (cached && cached.questions.length > 0) {
        try {
          let items: any[] = [...cached.questions];
          if (!allSelected) items = items.filter((q: any) => selectedDomains.includes(qDomainName(q)));
          items = shuffleArray(items).slice(0, limit);
          // フィルタで設定数に満たない場合はキャッシュ即遷移せず、フィルタ外から補充できる
          // フォールバック経路へ回す。ゲストはキャッシュが状態フィルタ済みでないため常に回す。
          if (items.length > 0 && (items.length >= limit || !hasStatusFilter) && !(isGuest && statusFiltersOn)) {
            setExerciseLoadPct(90);
            const questionIds = items.map((q: any) => q.questionId);
            // セッション作成は遷移先で非同期実行（クリティカルパスから除外）
            navigate('/aws/exercise/session', {
              state: {
                createSession: { userId, mode: 'exercise', examType, questionIds },
                questions: items.slice(0, 1),
                questionIds,
                userId, mode: 'exercise', examType, strikeEnabled, hideColumn,
              },
            });
            return;
          }
        } catch (err) {
          console.debug('[prefetch] exercise cache failed, fallback:', err);
        }
      }

      // ── フォールバック：プログレッシブロード ──
      // 1. IDのみ取得（Lambda側でフィルタ・優先度ソート）
      const idsParams = new URLSearchParams({ examType, shuffle: 'true', idsOnly: 'true' });
      if (!allSelected) idsParams.set('domain', domainsToIndices(examType, selectedDomains).join(','));
      if (user && bookmarkOnly)   idsParams.set('bookmarkOnly',  'true');
      if (user && unansweredOnly) idsParams.set('unansweredOnly', 'true');
      if (user && incorrectOnly)  idsParams.set('incorrectOnly',  'true');
      if (user) idsParams.set('userId', userId); // フィルタ無しでもドメイン均等化のため常に渡す
      const idsData = await fetch(`${API_ENDPOINT}/questions?${idsParams}`).then(r => r.json());
      const allIds: string[] = idsData.questionIds ?? [];
      // ゲストはローカルのセットで「優先」並べ替え（一致を先頭へ寄せ、不足分は自動でフィルタ外から埋まる）
      if (isGuest && statusFiltersOn) {
        const gAnswered = getGuestAnsweredIds(examType);
        const gIncorrect = getGuestIncorrectIds(examType);
        const gBookmarks = getGuestBookmarkIds();
        const score = (id: string) =>
          (unansweredOnly && !gAnswered.has(id) ? 1 : 0) +
          (incorrectOnly && gIncorrect.has(id) ? 1 : 0) +
          (bookmarkOnly && gBookmarks.has(id) ? 1 : 0);
        allIds.sort((a, b) => score(b) - score(a));
      }
      let selectedIds = allIds.slice(0, limit);
      // 優先フィルタで設定の問題数に満たない場合、同一ドメイン内のフィルタ外の問題で補充する
      if (selectedIds.length < limit && hasStatusFilter) {
        const fillParams = new URLSearchParams({ examType, shuffle: 'true', idsOnly: 'true' });
        if (!allSelected) fillParams.set('domain', domainsToIndices(examType, selectedDomains).join(','));
        if (user) fillParams.set('userId', userId);
        try {
          const fillData = await fetch(`${API_ENDPOINT}/questions?${fillParams}`).then(r => r.json());
          const have = new Set(selectedIds);
          for (const id of (fillData.questionIds ?? []) as string[]) {
            if (selectedIds.length >= limit) break;
            if (!have.has(id)) { selectedIds.push(id); have.add(id); }
          }
        } catch (e) { console.debug('[exercise] fill topup failed:', e); }
      }
      if (selectedIds.length === 0) { alert(t('exerciseSetup.noQuestions')); setExerciseLoading(false); return; }
      setExerciseLoadPct(50);
      // 2. 最初の1問だけ取得（セッション作成は遷移先で非同期実行）
      const q1Data = await fetch(`${API_ENDPOINT}/questions?ids=${selectedIds[0]}&withAnswers=true`).then(r => r.json());
      setExerciseLoadPct(90);
      // 3. 最初の1問で即遷移（2問目以降は ExerciseSession 内でバックグラウンドロード）
      navigate('/aws/exercise/session', {
        state: {
          createSession: { userId, mode: 'exercise', examType, questionIds: selectedIds },
          questions: q1Data.items ?? [],
          questionIds: selectedIds,
          userId, mode: 'exercise', examType, strikeEnabled, hideColumn,
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
        questionIds: exerciseDraft.questionIds ?? [],
        userId: exerciseDraft.userId, examType: exerciseDraft.examType, mode: 'exercise',
        resumeIndex: exerciseDraft.currentIndex, resumeResults: exerciseDraft.results,
        resumeAnswered: exerciseDraft.answered, resumeSelectedAnswers: exerciseDraft.selectedAnswers,
        hideColumn,
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
    await autoScoreAndClearDrafts(userId, [`examDraft_${userId}`]);
    setExamDraft(null);
    setExamLoading(true);
    setExamLoadPct(10);
    try {
      const plateau = randomPlateau();
      const stopAnim = animateLoadPct(setExamLoadPct, 10, plateau);
      const needFilter = user && (examUnansweredOnly || examIncorrectOnly || examBookmarkOnly);
      // 1. 候補IDのみ取得（idsOnly=軽量・validity済み・シャッフル）＋ユーザーのID集合を並行取得。
      //    全件＋解説の取得(withAnswers)は問題増加で肥大化しタイムアウトの原因になるため使わない。
      const idsParams = new URLSearchParams({ examType: targetExam, shuffle: 'true', idsOnly: 'true' });
      const [idsData, answeredRes, incorrectRes, bkmRes] = await Promise.all([
        fetch(`${API_ENDPOINT}/questions?${idsParams}`).then(r => r.json()),
        user ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : Promise.resolve(null),
        needFilter && examIncorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json()) : Promise.resolve(null),
        needFilter && examBookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
      ]);
      stopAnim?.();
      setExamLoadPct(plateau);
      let ids: string[] = idsData.questionIds ?? [];
      // フィルタは「除外」ではなく「優先」。一致を先頭に寄せ、不足分はフィルタ外から補充して設定問題数を必ず満たす。
      const ansSet = answeredRes ? new Set<string>(answeredRes.questionIds ?? []) : null;
      const incSet = (needFilter && examIncorrectOnly && incorrectRes) ? new Set<string>(incorrectRes.questionIds ?? []) : null;
      const bkmSet = (needFilter && examBookmarkOnly && bkmRes) ? new Set<string>(bkmRes.questionIds ?? []) : null;
      const wantUnanswered = !needFilter || examUnansweredOnly; // 既定は未回答優先、フィルタ時は指定に従う
      ids.sort((a, b) => {
        const sc = (id: string) =>
          (wantUnanswered && ansSet && !ansSet.has(id) ? 1 : 0) +
          (incSet && incSet.has(id) ? 1 : 0) +
          (bkmSet && bkmSet.has(id) ? 1 : 0);
        return sc(b) - sc(a);
      });
      ids = ids.slice(0, examQuestions);
      if (ids.length === 0) { alert(ja ? '条件に合う問題がありません' : 'No questions match'); setExamLoading(false); return; }
      setExamLoadPct(60);
      // 2. 選定したN問だけ取得（withAnswers, N≤試験問題数で有界）。順序は ids（シャッフル済み）に合わせる。
      const qData = await fetch(`${API_ENDPOINT}/questions?ids=${ids.join(',')}&withAnswers=true&examType=${targetExam}`).then(r => r.json());
      const orderMap = new Map(ids.map((id, i) => [id, i]));
      const items: any[] = (qData.items ?? []).sort((a: any, b: any) => (orderMap.get(a.questionId) ?? 0) - (orderMap.get(b.questionId) ?? 0));
      if (items.length === 0) { alert(ja ? '条件に合う問題がありません' : 'No questions match'); setExamLoading(false); return; }
      setExamLoadPct(90);
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType: targetExam, questionIds: ids }),
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

  // Shift+Enter でアクティブタブの開始/再開ボタンを発火（Web版のみ）
  const startKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  startKeyRef.current = (e: KeyboardEvent) => {
    if (window.innerWidth < 768 || !(e.key === 'Enter' && (e.ctrlKey || e.metaKey))) return;
    const el = e.target as HTMLElement | null;
    if (el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
    if (exerciseLoading || examLoading || showStartConfirm || showNewPanel || showNewExamPanel) return;
    e.preventDefault();
    if (tab === 'exercise') {
      if (availableCount === 0) return;
      hasDraft ? resumeExercise() : startExercise();
    } else {
      if (!targetExam) return;
      hasExamDraft ? resumeExam() : startExam();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => startKeyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <PageLayout className="page-container" style={{ paddingBottom: isMobile ? undefined : 80 }}>
      <Helmet>
        <title>練習 | 無限ノック</title>
        <meta name="description" content="AWS認定試験の練習問題に取り組もう。苦手分野を集中的に練習して合格スコアを目指そう。" />
      </Helmet>


      {/* タブ */}
      <div style={{ display: 'flex', borderBottom: '1px solid color-mix(in srgb, var(--color-text-light) 40%, transparent)', marginBottom: 'var(--spacing-lg)' }}>
        <button data-kbnav="tab" style={tabBtn(tab === 'exercise')} onClick={() => setTab('exercise')}>
          {ja ? '演習' : 'Exercise'}
        </button>
        <button data-kbnav="tab" style={tabBtn(tab === 'exam')} onClick={() => setTab('exam')}>
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
          {/* フィルタ（展開）。ゲストもローカル記録で利用可能 */}
          {(
            <div style={{ marginBottom: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                ['unansweredOnly', ja ? '未回答を優先' : 'Unanswered First'],
                ['incorrectOnly',  ja ? '不正解を優先' : 'Incorrect First'],
                ['bookmarkOnly',   ja ? 'ブックマークを優先' : 'Bookmarked First'],
              ] as [string, string][]).map(([key, label]) => {
                const stateMap: Record<string, boolean> = { unansweredOnly, incorrectOnly, bookmarkOnly };
                const setterMap: Record<string, (v: boolean) => void> = {
                  unansweredOnly: v => { setUnansweredOnly(v); if (v) setIncorrectOnly(false); },
                  incorrectOnly:  v => { setIncorrectOnly(v);  if (v) setUnansweredOnly(false); },
                  bookmarkOnly:   setBookmarkOnly,
                };
                const on = stateMap[key];
                return (
                  <label data-kbnav="1" key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} onChange={e => setterMap[key](e.target.checked)}
                      style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }} />
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: on ? 600 : 400, color: 'var(--color-text-main)' }}>{label}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* 問題数 */}
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', display: 'block', marginBottom: 8 }}>
              {ja ? '問題数' : 'Questions'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button
                data-kbnav="1"
                onClick={() => setLimit(v => Math.max(5, v - 5))}
                disabled={limit <= 5}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid color-mix(in srgb, var(--color-text-light) 40%, transparent)', background: 'transparent', cursor: limit <= 5 ? 'default' : 'pointer', fontSize: 'var(--font-size-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: limit <= 5 ? 'var(--color-text-light)' : 'var(--color-text-main)' }}
              >−</button>
              <span style={{ fontSize: 24, fontWeight: 800, minWidth: 64, textAlign: 'center', color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {limit}<span style={{ fontSize: 'var(--font-size-sm2)', fontWeight: 400, marginLeft: 2, color: 'var(--color-text-sub)' }}>{ja ? '問' : 'Q'}</span>
              </span>
              <button
                data-kbnav="1"
                onClick={() => setLimit(v => Math.min(examCfg?.totalQuestions ?? 65, v + 5))}
                disabled={limit >= (examCfg?.totalQuestions ?? 65)}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid color-mix(in srgb, var(--color-text-light) 40%, transparent)', background: 'transparent', cursor: limit >= (examCfg?.totalQuestions ?? 65) ? 'default' : 'pointer', fontSize: 'var(--font-size-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: limit >= (examCfg?.totalQuestions ?? 65) ? 'var(--color-text-light)' : 'var(--color-text-main)' }}
              >+</button>
            </div>
          </div>

          {availableCount !== null && availableCount > 0 && availableCount < limit
            && (
            <div style={{ marginBottom: 'var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-warning)', background: 'var(--color-bg-warning)', border: '1px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px' }}>
              ⚠️ {(bookmarkOnly || unansweredOnly || incorrectOnly)
                ? (ja
                    ? `条件に合う問題は${availableCount}問です。不足分は条件外の問題で補い、${limit}問で開始します。`
                    : `Only ${availableCount} questions match the filter. The rest will be filled from outside the filter to start with ${limit}.`)
                : (ja
                    ? `条件に合う問題が${availableCount}問しかありません。${availableCount}問で開始します。`
                    : `Only ${availableCount} questions match. Session will start with ${availableCount} questions.`)}
            </div>
          )}

          {/* ── オプション（折りたたみ：出題ドメイン） ── */}
          <div style={{ marginBottom: 'var(--spacing-lg)', border: '1px solid color-mix(in srgb, var(--color-text-light) 40%, transparent)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
            <button
              data-kbnav="1"
              onClick={() => setShowExerciseOptions(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'var(--color-bg-main)', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-sub)' }}
            >
              {showExerciseOptions ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              {ja ? 'オプション' : 'Options'}
              {selectedDomains.length > 0 && selectedDomains.length < (EXAM_DOMAINS[examType]?.length ?? 0) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--font-size-2xs)', fontWeight: 700 }}>
                  {selectedDomains.length}
                </span>
              )}
            </button>
            {showExerciseOptions && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid color-mix(in srgb, var(--color-text-light) 40%, transparent)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-light)', letterSpacing: '0.05em', marginBottom: 2 }}>{ja ? 'ドメイン' : 'Domain'}</div>
                {/* 全て */}
                <label data-kbnav="1" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 6, borderBottom: '1px solid color-mix(in srgb, var(--color-text-light) 20%, transparent)' }}>
                  <input
                    type="checkbox"
                    checked={(EXAM_DOMAINS[examType] ?? []).every(d => selectedDomains.includes(d))}
                    onChange={() => {
                      const all = EXAM_DOMAINS[examType] ?? [];
                      setSelectedDomains(all.every(d => selectedDomains.includes(d)) ? [] : all);
                    }}
                    style={{ width: 15, height: 15, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)' }}>{ja ? '全て' : 'All'}</span>
                </label>
                {(EXAM_DOMAINS[examType] ?? []).map(domain => {
                  const checked = selectedDomains.includes(domain);
                  const rate = user ? domainRates[domain] : undefined;
                  return (
                    <label data-kbnav="1" key={domain} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedDomains(prev =>
                          checked ? prev.filter(d => d !== domain) : [...prev, domain]
                        )}
                        style={{ width: 15, height: 15, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                      />
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', flex: 1 }}>{domain}</span>
                      {rate != null && (
                        <span style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: rate < 0.4 ? 'var(--color-danger)' : rate < 0.6 ? 'var(--color-caution)' : 'var(--color-text-sub)', flexShrink: 0 }}>
                          {Math.round(rate * 100)}%
                        </span>
                      )}
                    </label>
                  );
                })}
                {selectedDomains.length === 0 && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', marginTop: 2 }}>
                    {ja ? '1つ以上選択してください' : 'Select at least one domain'}
                  </div>
                )}
                <div style={{ paddingTop: 8, marginTop: 2, borderTop: '1px solid color-mix(in srgb, var(--color-text-light) 20%, transparent)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-light)', letterSpacing: '0.05em', marginBottom: 6 }}>{ja ? 'その他' : 'Other'}</div>
                  <label data-kbnav="1" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={strikeEnabled}
                      onChange={() => setStrikeEnabled(v => !v)}
                      style={{ width: 15, height: 15, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                      {ja ? '消去法機能をオン' : 'Enable elimination mode'}
                    </span>
                  </label>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 4, lineHeight: 1.5 }}>
                    ※ {ja ? '選択肢のテキストをタップすると取り消し線を引いて選択肢を絞り込める機能です' : 'Tap choice text to strike through and narrow down options'}
                  </div>
                  <label data-kbnav="1" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={hideColumn}
                      onChange={() => setHideColumn(v => !v)}
                      style={{ width: 15, height: 15, flexShrink: 0, accentColor: 'var(--color-primary)' }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                      {ja ? 'コラム（豆知識）を非表示' : 'Hide column tips'}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
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
              {/* フィルタ（展開） */}
              {user && (
                <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {([
                    ['examUnansweredOnly', ja ? '未回答を優先' : 'Unanswered First'],
                    ['examIncorrectOnly',  ja ? '不正解を優先' : 'Incorrect First'],
                    ['examBookmarkOnly',   ja ? 'ブックマークを優先' : 'Bookmarked First'],
                  ] as [string, string][]).map(([key, label]) => {
                    const stateMap: Record<string, boolean> = { examUnansweredOnly, examIncorrectOnly, examBookmarkOnly };
                    const setterMap: Record<string, (v: boolean) => void> = {
                      examUnansweredOnly: v => { setExamUnansweredOnly(v); if (v) setExamIncorrectOnly(false); },
                      examIncorrectOnly:  v => { setExamIncorrectOnly(v);  if (v) setExamUnansweredOnly(false); },
                      examBookmarkOnly:   setExamBookmarkOnly,
                    };
                    const on = stateMap[key];
                    return (
                      <label data-kbnav="1" key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={e => setterMap[key](e.target.checked)}
                          style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--color-primary)' }} />
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: on ? 600 : 400, color: 'var(--color-text-main)' }}>{label}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* ミニ模試チェックボックス */}
              <label data-kbnav="1" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)', marginBottom: 16 }}>
                <input
                  type="checkbox"
                  checked={examMode === 'mini'}
                  onChange={e => setExamMode(e.target.checked ? 'mini' : 'full')}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                {ja ? 'ミニ模試（問題数・時間を1/5に短縮）' : 'Mini mode (1/5 questions & time)'}
              </label>

              {/* ── 試験情報セクション ── */}
              <div style={{ borderTop: '1px solid color-mix(in srgb, var(--color-text-light) 40%, transparent)', marginTop: 4 }} />
              <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden', marginTop: 14 }}>
                <div style={{ padding: '8px 14px', background: 'var(--color-bg-white)', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {ja ? '試験情報' : 'Exam Info'}
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '問題数' : 'Questions'}</div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{examQuestions}<span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400 }}>{ja ? '問' : ' Q'}</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '制限時間' : 'Time Limit'}</div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{examTimeMin}<span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400 }}>{ja ? '分' : ' min'}</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '合格点' : 'Pass Score'}</div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>
                        {examMode === 'mini'
                          ? Math.ceil((PASS_SCORES[targetExam] ?? 0) / 5)
                          : PASS_SCORES[targetExam]}
                      </div>
                    </div>
                  </div>
                  <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: 0 }}>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>{ja ? 'ルール' : 'Rules'}</div>
                {examRules.map((r, i) => (
                  <div key={i} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: i < examRules.length - 1 ? 4 : 0 }}>
                    <span style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 1 }}>•</span>
                    <span>{r}</span>
                  </div>
                ))}
                  </div>
                </div>
              </div>

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
              <div style={{ position: 'fixed', bottom: 116, left: 0, right: 0, zIndex: 211, background: 'var(--color-bg-white)', borderRadius: '14px 14px 0 0', padding: '14px 0 12px', boxShadow: 'var(--box-shadow-up)', animation: 'slideUp 0.22s ease' }}>
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
            <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, background: 'var(--color-bg-white)', borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', gap: 6, boxShadow: 'var(--box-shadow-up)' }}>
              {hasDraft ? (
                <div style={{ flex: 1, display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden', opacity: availableCount === 0 ? 0.5 : 1 }}>
                  <button
                    data-kbnav="1"
                    disabled={exerciseLoading || availableCount === 0}
                    onClick={resumeExercise}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (exerciseLoading || availableCount === 0) ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {exerciseLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                        {ja ? `準備中... ${exerciseLoadPct}%` : `Loading... ${exerciseLoadPct}%`}
                      </span>
                    ) : (
                      <>
                        {ja ? '演習を再開' : 'Resume'}
                        {exerciseDraft?.results != null && exerciseDraft?.questions != null && (
                          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, opacity: 0.85 }}>
                            （{exerciseDraft.results.length}/{exerciseDraft.questions.length}問）
                          </span>
                        )}
                      </>
                    )}
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
                  data-kbnav="1"
                  disabled={exerciseLoading || availableCount === 0}
                  onClick={startExercise}
                  style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (exerciseLoading || availableCount === 0) ? 'default' : 'pointer', opacity: availableCount === 0 ? 0.5 : 1 }}
                >
                  {exerciseLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                      {ja ? `準備中... ${exerciseLoadPct}%` : `Loading... ${exerciseLoadPct}%`}
                    </span>
                  ) : (<>{ja ? '演習を開始' : 'Start'}{!isMobile && <span style={{ marginLeft: 8, display: 'inline-flex', verticalAlign: 'middle' }}><KeyHint /></span>}</>)}
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
                    data-kbnav="1"
                    disabled={exerciseLoading || availableCount === 0}
                    onClick={resumeExercise}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (exerciseLoading || availableCount === 0) ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {exerciseLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                        {ja ? `準備中... ${exerciseLoadPct}%` : `Loading... ${exerciseLoadPct}%`}
                      </span>
                    ) : (
                      <>
                        {ja ? '演習を再開' : 'Resume'}
                        {exerciseDraft?.results != null && exerciseDraft?.questions != null && (
                          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, opacity: 0.85 }}>
                            （{exerciseDraft.results.length}/{exerciseDraft.questions.length}問）
                          </span>
                        )}
                        {!isMobile && <KeyHint />}
                      </>
                    )}
                  </button>
                  <button
                    data-kbnav="1"
                    onClick={startExercise}
                    style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label={ja ? '新規で開始' : 'Start new'}
                  >
                    <IconChevronUp size={16} />
                  </button>
                </div>
              ) : (
                <button
                  data-kbnav="1"
                  disabled={exerciseLoading || availableCount === 0}
                  onClick={startExercise}
                  style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: (exerciseLoading || availableCount === 0) ? 'default' : 'pointer', opacity: availableCount === 0 ? 0.5 : 1 }}
                >
                  {exerciseLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                      {ja ? `準備中... ${exerciseLoadPct}%` : `Loading... ${exerciseLoadPct}%`}
                    </span>
                  ) : (<>{ja ? '演習を開始' : 'Start'}{!isMobile && <span style={{ marginLeft: 8, display: 'inline-flex', verticalAlign: 'middle' }}><KeyHint /></span>}</>)}
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
              <div style={{ position: 'fixed', bottom: 116, left: 0, right: 0, zIndex: 211, background: 'var(--color-bg-white)', borderRadius: '14px 14px 0 0', padding: '14px 0 12px', boxShadow: 'var(--box-shadow-up)', animation: 'slideUp 0.22s ease' }}>
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
            <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, background: 'var(--color-bg-white)', borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', gap: 6, boxShadow: 'var(--box-shadow-up)' }}>
              {hasExamDraft ? (
                <div style={{ flex: 1, display: 'flex', height: 44, borderRadius: 22, overflow: 'hidden' }}>
                  <button
                    data-kbnav="1"
                    disabled={examLoading}
                    onClick={resumeExam}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: examLoading ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {examLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                        {ja ? `準備中... ${examLoadPct}%` : `Preparing... ${examLoadPct}%`}
                      </span>
                    ) : (
                      <>
                        {ja ? '模試を再開' : 'Resume'}
                        {examDraft?.timeLeft != null && (
                          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, opacity: 0.85 }}>
                            （{fmtSec(examDraft.timeLeft)}・{(examDraft.currentIndex ?? 0) + 1}/{examDraft.questions?.length ?? '?'}問）
                          </span>
                        )}
                        {!isMobile && <KeyHint />}
                      </>
                    )}
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
                  data-kbnav="1"
                  disabled={examLoading}
                  onClick={startExam}
                  style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: examLoading ? 'default' : 'pointer' }}
                >
                  {examLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                      {ja ? `準備中... ${examLoadPct}%` : `Preparing... ${examLoadPct}%`}
                    </span>
                  ) : (ja ? `模試を開始${examMode === 'mini' ? '（ミニ）' : ''}` : `Start${examMode === 'mini' ? ' Mini' : ''} Exam`)}
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
                    data-kbnav="1"
                    disabled={examLoading}
                    onClick={resumeExam}
                    style={{ flex: 1, height: 44, border: 'none', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: examLoading ? 'default' : 'pointer', paddingLeft: 16, paddingRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {examLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                        {ja ? `準備中... ${examLoadPct}%` : `Preparing... ${examLoadPct}%`}
                      </span>
                    ) : (
                      <>
                        {ja ? '模試を再開' : 'Resume'}
                        {examDraft?.timeLeft != null && (
                          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, opacity: 0.85 }}>
                            （{fmtSec(examDraft.timeLeft)}・{(examDraft.currentIndex ?? 0) + 1}/{examDraft.questions?.length ?? '?'}問）
                          </span>
                        )}
                        {!isMobile && <KeyHint />}
                      </>
                    )}
                  </button>
                  <button
                    data-kbnav="1"
                    onClick={startExam}
                    style={{ width: 44, height: 44, border: 'none', borderLeft: '2px solid rgba(255,255,255,0.4)', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    aria-label={ja ? '新規で試験を開始' : 'Start new exam'}
                  >
                    <IconChevronUp size={16} />
                  </button>
                </div>
              ) : (
                <button
                  data-kbnav="1"
                  disabled={examLoading}
                  onClick={startExam}
                  style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: examLoading ? 'default' : 'pointer' }}
                >
                  {examLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />
                      {ja ? `準備中... ${examLoadPct}%` : `Preparing... ${examLoadPct}%`}
                    </span>
                  ) : (<>{ja ? '模試を開始' : 'Start Mock Exam'}{!isMobile && <span style={{ marginLeft: 8, display: 'inline-flex', verticalAlign: 'middle' }}><KeyHint /></span>}</>)}
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
    </PageLayout>
  );
}
