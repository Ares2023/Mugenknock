import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_DOMAINS, qDomainName } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import DomainSelector from '../components/DomainSelector';
import { getCached, setCached, SHORT_TTL } from '../utils/cache';
import { syncTargetExamToServer } from '../utils/preferences';
import { IconLightbulb } from '../components/Icons';

const StepBadge = ({ n, optional = false }: { n: number; optional?: boolean }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    fontSize: 11, fontWeight: 700,
  }}>{n}</span>
);

const StepRow = ({ n, optional = false, isLast = false, title, children }: {
  n: number;
  optional?: boolean;
  isLast?: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div style={{ display: 'flex', gap: 14 }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
      <StepBadge n={n} optional={optional} />
      {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--color-border)', marginTop: 5, borderRadius: 1 }} />}
    </div>
    <div style={{ flex: 1, paddingBottom: isLast ? 0 : 'var(--spacing-xl)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)', lineHeight: '20px', marginBottom: 'var(--spacing-sm)' }}>
        {title}
      </div>
      {children}
    </div>
  </div>
);


function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ドメインごとの累計演習問数（domain_history から集計）
function getDomainExerciseCounts(examType: string, uid: string, domains: string[]): Record<string, number> {
  try {
    const dh: Record<string, { correct: number; total: number }[]> =
      JSON.parse(localStorage.getItem(`domain_history_${examType}_${uid}`) ?? '{}');
    const counts: Record<string, number> = {};
    for (const d of domains) {
      counts[d] = (dh[d] ?? []).reduce((sum, s) => sum + (s.total ?? 0), 0);
    }
    return counts;
  } catch { return {}; }
}

// ドメインバランス均等化選択
// - 各ドメインから均等にピックアップ（努力目標）
// - 演習数の少ないドメインを優先（リバランス）
// - ドメインに問題が足りなければ他で補完
function balancedDomainSelect(pool: any[], domains: string[], limit: number, exerciseCounts: Record<string, number>): any[] {
  if (pool.length <= limit) return shuffleArray(pool);

  // ドメイン別バケツ分け（最初にマッチするドメインに割り当て）
  const byDomain: Record<string, any[]> = {};
  const unclaimed: any[] = [];
  for (const d of domains) byDomain[d] = [];
  for (const q of pool) {
    const dn = qDomainName(q);
    const primaryDomain = dn && domains.includes(dn) ? dn : undefined;
    if (primaryDomain) byDomain[primaryDomain].push(q);
    else unclaimed.push(q);
  }
  for (const d of domains) byDomain[d] = shuffleArray(byDomain[d]);

  // 演習数の少ない順でドメインを並べる（優先度順）
  const activeDomains = domains.filter(d => byDomain[d].length > 0);
  activeDomains.sort((a, b) => (exerciseCounts[a] ?? 0) - (exerciseCounts[b] ?? 0));

  if (activeDomains.length === 0) return shuffleArray(pool).slice(0, limit);

  // ラウンドロビンでスロット割り当て（均等 + 優先度順に余りを配分）
  const slots: Record<string, number> = {};
  for (const d of activeDomains) slots[d] = 0;
  let remaining = limit;
  while (remaining > 0) {
    let anyAdded = false;
    for (const d of activeDomains) {
      if (remaining <= 0) break;
      if (slots[d] < byDomain[d].length) { slots[d]++; remaining--; anyAdded = true; }
    }
    if (!anyAdded) break;
  }

  // 各ドメインのスロット分だけピック → 最後にシャッフルして順序をランダムに
  const selected: any[] = [];
  const usedIds = new Set<string>();
  for (const d of activeDomains) {
    for (const q of byDomain[d].slice(0, slots[d])) {
      selected.push(q); usedIds.add(q.questionId);
    }
  }
  // unclaimed な問題で不足分を補完
  if (selected.length < limit) {
    for (const q of shuffleArray(unclaimed)) {
      if (selected.length >= limit) break;
      if (!usedIds.has(q.questionId)) { selected.push(q); usedIds.add(q.questionId); }
    }
  }
  return shuffleArray(selected);
}

const loadExercisePrefs = (et: string, uid: string) => {
  try { return JSON.parse(localStorage.getItem(`exercisePrefs_${uid}`) ?? '{}')[et] ?? {}; }
  catch { return {}; }
};
const saveExercisePrefs = (et: string, uid: string, prefs: object) => {
  try {
    const stored = JSON.parse(localStorage.getItem(`exercisePrefs_${uid}`) ?? '{}');
    stored[et] = prefs;
    localStorage.setItem(`exercisePrefs_${uid}`, JSON.stringify(stored));
  } catch {}
};

export default function ExerciseSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const uid = user?.userId ?? 'guest';
  const [targetExam, setTargetExamState] = useState<string | null>(() => localStorage.getItem(`targetExam_${uid}`));
  const [examType, setExamType] = useState<string>(() => localStorage.getItem(`targetExam_${uid}`) || 'SAA');

  const handleSelectExamInSetup = (et: string) => {
    localStorage.setItem(`targetExam_${uid}`, et);
    setTargetExamState(et);
    setExamType(et);
    if (user) syncTargetExamToServer(user.userId, uid, et);
  };
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => {
    const et = localStorage.getItem(`targetExam_${uid}`) || 'SAA';
    return loadExercisePrefs(et, uid).domains ?? EXAM_DOMAINS[et] ?? [];
  });
  const [limit, setLimit] = useState<number>(() => loadExercisePrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA', uid).limit ?? 10);
  const [loading, setLoading] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [bookmarkOnly, setBookmarkOnly] = useState<boolean>(() => loadExercisePrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA', uid).bookmarkOnly ?? false);
  const [unansweredOnly, setUnansweredOnly] = useState<boolean>(() => loadExercisePrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA', uid).unansweredOnly ?? false);
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(() => loadExercisePrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA', uid).incorrectOnly ?? false);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem(`sherpaExerciseHint_${uid}`));
  const [exerciseDraft] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem(`exerciseDraft_${uid}`) ?? 'null'); } catch { return null; }
  });
  const hasDraft = exerciseDraft?.examType === examType;

  const [availableCount, setAvailableCount] = useState<number | null>(null);
  type DomainStat = { tagId: string; correctCount: number; incorrectCount: number };
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);

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
          if (bookmarkOnly && bkmRes) {
            const bookmarkIds = new Set(bkmRes.questionIds ?? []);
            items = items.filter((q: any) => bookmarkIds.has(q.questionId));
          }
          if (unansweredOnly && answeredRes) {
            const answeredIds = new Set(answeredRes.questionIds ?? []);
            items = items.filter((q: any) => !answeredIds.has(q.questionId));
          }
          if (incorrectOnly && incorrectRes) {
            const incorrectIds = new Set(incorrectRes.questionIds ?? []);
            items = items.filter((q: any) => incorrectIds.has(q.questionId));
          }
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
    const cachedStats = getCached<any[]>(`ustats_${user.userId}`);
    if (cachedStats !== null) { setDomainStats(cachedStats); return; }
    fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`)
      .then(r => r.json())
      .then(d => { setDomainStats(d.stats ?? []); setCached(`ustats_${user.userId}`, d.stats ?? [], SHORT_TTL); })
      .catch(() => setDomainStats([]));
  }, [user]);

  const resumeSession = () => {
    if (!exerciseDraft) return;
    navigate('/aws/exercise/session', {
      state: {
        sessionId: exerciseDraft.sessionId,
        questions: exerciseDraft.questions,
        userId: exerciseDraft.userId,
        examType: exerciseDraft.examType,
        mode: 'exercise',
        resumeIndex: exerciseDraft.currentIndex,
        resumeResults: exerciseDraft.results,
        resumeAnswered: exerciseDraft.answered,
        resumeSelectedAnswers: exerciseDraft.selectedAnswers,
      }
    });
  };

  const startSession = async () => {
    if (selectedDomains.length === 0) {
      alert(lang === 'ja' ? '出題ドメインを最低1つ選択してください' : 'Please select at least one domain');
      return;
    }
    setLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      let selectedItems: any[];

      const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
      if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
        const params = new URLSearchParams({ examType, withAnswers: 'true' });
        if (!allSelected) params.set('domain', selectedDomains.join(','));

        const [qRes, bkmRes, answeredRes, incorrectRes] = await Promise.all([
          fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
          user && bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
          user && unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
          user && incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
        ]);
        let pool: any[] = qRes.items ?? [];
        let filtered = [...pool];
        if (bookmarkOnly && bkmRes) {
          const bookmarkIds = new Set(bkmRes.questionIds ?? []);
          filtered = filtered.filter((q: any) => bookmarkIds.has(q.questionId));
        }
        if (unansweredOnly && answeredRes) {
          const answeredIds = new Set(answeredRes.questionIds ?? []);
          filtered = filtered.filter((q: any) => !answeredIds.has(q.questionId));
        }
        if (incorrectOnly && incorrectRes) {
          const incorrectIds = new Set(incorrectRes.questionIds ?? []);
          const incorrectCounts: Record<string, number> = incorrectRes.counts ?? {};
          filtered = filtered.filter((q: any) => incorrectIds.has(q.questionId));
          filtered.sort((a: any, b: any) => (incorrectCounts[b.questionId] ?? 0) - (incorrectCounts[a.questionId] ?? 0));
        } else {
          const exCounts = getDomainExerciseCounts(examType, userId, selectedDomains);
          filtered = balancedDomainSelect(filtered, selectedDomains, limit, exCounts);
        }
        let usedFallback = false;
        if (filtered.length < limit && filtered.length < pool.length) {
          const usedIds = new Set(filtered.map((q: any) => q.questionId));
          filtered = [...filtered, ...shuffleArray(pool.filter((q: any) => !usedIds.has(q.questionId)))];
          usedFallback = true;
        }
        selectedItems = filtered.slice(0, limit);
        if (usedFallback) alert(lang === 'ja' ? 'フィルタ条件に合う問題が不足したため、条件外の問題も含めて出題します。' : 'Not enough questions matched your filters. Including additional questions.');
      } else {
        const params = new URLSearchParams({ examType, withAnswers: 'true' });
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        const res = await fetch(`${API_ENDPOINT}/questions?${params}`);
        const data = await res.json();
        let allItems: any[] = data.items ?? [];
        const exCounts = getDomainExerciseCounts(examType, userId, selectedDomains);
        selectedItems = balancedDomainSelect(allItems, selectedDomains, limit, exCounts);
      }

      if (selectedItems.length === 0) {
        alert(t('exerciseSetup.noQuestions'));
        setLoading(false);
        return;
      }

      const questionIds = selectedItems.map((q: any) => q.questionId);
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exercise', examType, questionIds })
      });
      const sessionData = await sessionRes.json();

      navigate('/aws/exercise/session', {
        state: { sessionId: sessionData.sessionId, questions: selectedItems, userId, mode: 'exercise', examType }
      });
    } catch (err) {
      console.error(err);
      alert(t('exerciseSetup.startFailed'));
    } finally {
      setLoading(false);
    }
  };

  let _s = 0;
  const examStep    = targetExam ? null : ++_s;
  const domainStep  = ++_s;
  const optionsStep = ++_s;
  const countStep   = ++_s;

  const domainRates: Record<string, number | null> = {};
  for (const d of EXAM_DOMAINS[examType]) {
    const s = domainStats.find(x => x.tagId === d);
    if (!s) { domainRates[d] = null; continue; }
    const total = s.correctCount + s.incorrectCount;
    domainRates[d] = total > 0 ? s.correctCount / total : null;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">

      {showHint && (
        <div className="fade-slide-in" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
          background: 'var(--color-hint-bg)', border: '1px solid var(--color-hint-border)',
          borderRadius: 'var(--border-radius-md)', padding: '10px var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)',
        }}>
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: 'var(--color-text-sub)' }}><IconLightbulb size={16} /></span>
          <span style={{ flex: 1, lineHeight: 1.5 }}>{t('exerciseSetup.hint')}</span>
          <button
            onClick={() => { localStorage.setItem(`sherpaExerciseHint_${uid}`, '1'); setShowHint(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

        {/* 設定フォーム */}
        <Card padding="var(--spacing-xl)">
          {/* 試験種別 */}
          {targetExam ? (
            <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
              <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-sub)' }}>{t('exerciseSetup.examType')}</span>
              <Badge variant="secondary">{examType}</Badge>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>{t('exerciseSetup.examTypeHome')}</span>
            </div>
          ) : (
            <StepRow n={examStep!} title={t('exerciseSetup.examType')}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                {EXAM_TYPES.map(et => (
                  <Button key={et} variant="outline" size="sm"
                    onClick={() => handleSelectExamInSetup(et)}
                    style={{ width: 72, ...(examType === et ? { background: 'var(--color-primary-light)', borderWidth: 2 } : {}) }}>
                    {et}
                  </Button>
                ))}
              </div>
            </StepRow>
          )}

          {/* ドメインフィルタ */}
          <StepRow n={domainStep} optional
            title={t('exerciseSetup.domain')}>
            <DomainSelector
              domains={EXAM_DOMAINS[examType]}
              selected={selectedDomains}
              onChange={setSelectedDomains}
              lang={lang}
              noMargin
              weakRates={user ? domainRates : undefined}
            />
          </StepRow>

          {/* オプション */}
          <StepRow n={optionsStep} optional
            title={t('exerciseSetup.options')}>
            <div style={{ padding: 'var(--spacing-md)', background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
              {user && (
                <label title={t('exerciseSetup.unansweredOnlyDesc')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                  <input type="checkbox" checked={unansweredOnly} onChange={e => { setUnansweredOnly(e.target.checked); if (e.target.checked) setIncorrectOnly(false); }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  {t('exerciseSetup.unansweredOnly')}
                </label>
              )}
              {user && (
                <label title={t('exerciseSetup.incorrectOnlyDesc')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                  <input type="checkbox" checked={incorrectOnly} onChange={e => { setIncorrectOnly(e.target.checked); if (e.target.checked) setUnansweredOnly(false); }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  {t('exerciseSetup.incorrectOnly')}
                </label>
              )}
              {user && (
                <label title={t('exerciseSetup.bookmarkOnlyDesc')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                  <input type="checkbox" checked={bookmarkOnly} onChange={e => setBookmarkOnly(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  {t('exerciseSetup.bookmarkOnly')}
                </label>
              )}
              {!user && (
                <div style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
                  {lang === 'ja'
                    ? '※ ログインするとブックマーク・未回答・誤答フィルタが使えます'
                    : '* Log in to filter by bookmarks, unanswered, or incorrect'}
                </div>
              )}
            </div>
          </StepRow>

          {/* 問題数 */}
          <StepRow n={countStep} isLast title={t('exerciseSetup.questionCount')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
              <input type="number" value={limit} onChange={e => setLimit(Math.max(1, parseInt(e.target.value) || 1))}
                min={1} max={availableCount ?? 50}
                style={{ padding: '8px 12px', width: 100, border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', transition: 'border-color 0.2s' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
                {availableCount !== null ? t('exerciseSetup.maxQ', { n: availableCount }) : t('exerciseSetup.loading')}
              </span>
            </div>
            {availableCount !== null && availableCount > 0 && availableCount < limit && (
              <div style={{ marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-warning)', background: 'var(--color-bg-warning)', border: '1px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px' }}>
                ⚠️ {lang === 'ja'
                  ? `条件に合う問題が${availableCount}問しかありません。${availableCount}問で開始します。`
                  : `Only ${availableCount} questions match the criteria. The session will start with ${availableCount} questions.`}
              </div>
            )}
          </StepRow>

        </Card>
      <div className="sticky-page-action">
        {!user && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 6, textAlign: 'center' }}>
            {lang === 'ja' ? '※ ログインすると結果が保存されます' : '* Log in to save your results'}
          </div>
        )}
        <Button
          variant="primary"
          onClick={() => hasDraft ? setShowStartConfirm(true) : startSession()}
          disabled={loading || availableCount === 0}
          style={{ width: '100%' }}
        >
          {loading ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
              {t('exerciseSetup.starting')}
            </span>
          ) : t('exerciseSetup.start')}
        </Button>
      </div>

      {/* ── 開始確認モーダル ── */}
      {showStartConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 20px', width: '100%', maxWidth: 360, boxShadow: 'var(--box-shadow-md)' }}>
            <p style={{ margin: '0 0 20px', fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', lineHeight: 1.6 }}>
              {lang === 'ja' ? '現在の演習セッションを上書きして新しく始めます。よろしいですか？' : 'This will overwrite the current session. Continue?'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" style={{ flex: 1 }} onClick={() => setShowStartConfirm(false)}>
                {lang === 'ja' ? 'キャンセル' : 'Cancel'}
              </Button>
              <Button variant="primary" style={{ flex: 1 }} onClick={() => { setShowStartConfirm(false); startSession(); }}>
                {lang === 'ja' ? '開始する' : 'Start'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {loading && <div
        style={{ position: 'fixed', inset: 0, zIndex: 9000, cursor: 'wait' }}
        onTouchStart={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      />}
    </div>
  );
}
