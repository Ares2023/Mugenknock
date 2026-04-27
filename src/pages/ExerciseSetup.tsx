import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, PASS_SCORES, DOMAIN_NAME_EN } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import DomainSelector from '../components/DomainSelector';

const StepBadge = ({ n, optional = false }: { n: number; optional?: boolean }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
    background: optional ? 'var(--color-border)' : 'var(--color-primary)',
    color: optional ? 'var(--color-text-sub)' : 'white',
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

const EXERCISE_PREFS_KEY = 'exercisePrefs';
const loadExercisePrefs = (et: string) => {
  try { return JSON.parse(localStorage.getItem(EXERCISE_PREFS_KEY) ?? '{}')[et] ?? {}; }
  catch { return {}; }
};
const saveExercisePrefs = (et: string, prefs: object) => {
  try {
    const stored = JSON.parse(localStorage.getItem(EXERCISE_PREFS_KEY) ?? '{}');
    stored[et] = prefs;
    localStorage.setItem(EXERCISE_PREFS_KEY, JSON.stringify(stored));
  } catch {}
};

export default function ExerciseSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const [targetExam, setTargetExamState] = useState<string | null>(() => localStorage.getItem('targetExam'));
  const [examType, setExamType] = useState<string>(() => localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA');

  const handleSelectExamInSetup = (et: string) => {
    localStorage.setItem('targetExam', et);
    setTargetExamState(et);
    setExamType(et);
  };
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => {
    const et = localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA';
    return loadExercisePrefs(et).domains ?? EXAM_DOMAINS[et] ?? [];
  });
  const [limit, setLimit] = useState<number>(() => loadExercisePrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').limit ?? 10);
  const [shuffle, setShuffle] = useState<boolean>(() => loadExercisePrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').shuffle ?? false);
  const [loading, setLoading] = useState(false);
  const [bookmarkOnly, setBookmarkOnly] = useState<boolean>(() => loadExercisePrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').bookmarkOnly ?? false);
  const [unansweredOnly, setUnansweredOnly] = useState<boolean>(() => loadExercisePrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').unansweredOnly ?? false);
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(() => loadExercisePrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').incorrectOnly ?? false);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('sherpaExerciseHint'));
  const [exerciseDraft] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('exerciseDraft') ?? 'null'); } catch { return null; }
  });
  const hasDraft = exerciseDraft?.examType === examType;

  const info = EXAM_CONFIGS[examType];
  const passScore = PASS_SCORES[examType];
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [answeredCount, setAnsweredCount] = useState<number | null>(null);
  type DomainStat = { tagId: string; correctCount: number; incorrectCount: number };
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const prefs = loadExercisePrefs(examType);
    setSelectedDomains(prefs.domains ?? EXAM_DOMAINS[examType]);
    setLimit(prefs.limit ?? 10);
    setShuffle(prefs.shuffle ?? false);
    setBookmarkOnly(prefs.bookmarkOnly ?? false);
    setUnansweredOnly(prefs.unansweredOnly ?? false);
    setIncorrectOnly(prefs.incorrectOnly ?? false);
  }, [examType]);

  useEffect(() => {
    saveExercisePrefs(examType, { domains: selectedDomains, limit, shuffle, bookmarkOnly, unansweredOnly, incorrectOnly });
  }, [examType, selectedDomains, limit, shuffle, bookmarkOnly, unansweredOnly, incorrectOnly]);

  useEffect(() => {
    setAvailableCount(null);
    setAnsweredCount(null);

    const fetchCounts = async () => {
      if (selectedDomains.length === 0) { setAvailableCount(0); return; }
      try {
        const params = new URLSearchParams({ examType });
        const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
        if (!allSelected) params.set('domain', selectedDomains.join(','));

        if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
          const [qRes, bkmRes, answeredRes, incorrectRes] = await Promise.all([
            fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
            bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${user.userId}`).then(r => r.json()) : Promise.resolve(null),
            unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${user.userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
            incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${user.userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
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
        } else {
          const qRes = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
          setAvailableCount(qRes.count ?? qRes.items?.length ?? 0);
        }
      } catch { setAvailableCount(0); }
    };

    fetchCounts();

    if (user) {
      fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${user.userId}&examType=${examType}`)
        .then(r => r.json())
        .then(d => setAnsweredCount(d.answeredCount ?? 0))
        .catch(() => setAnsweredCount(0));
      fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`)
        .then(r => r.json())
        .then(d => setDomainStats(d.stats ?? []))
        .catch(() => setDomainStats([]));
    } else {
      setAnsweredCount(0);
      setDomainStats([]);
    }
  }, [examType, selectedDomains, user, bookmarkOnly, unansweredOnly, incorrectOnly]);

  const resumeSession = () => {
    if (!exerciseDraft) return;
    navigate('/exercise/session', {
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
        resumeDetail: exerciseDraft.detail,
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
        const params = new URLSearchParams({ examType });
        if (!allSelected) params.set('domain', selectedDomains.join(','));

        const [qRes, bkmRes, answeredRes, incorrectRes] = await Promise.all([
          fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
          bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
          unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
          incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
        ]);
        let filtered: any[] = qRes.items ?? [];
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
          filtered = filtered.filter((q: any) => incorrectIds.has(q.questionId));
        }
        if (shuffle) filtered = shuffleArray(filtered);
        selectedItems = filtered.slice(0, limit);
      } else {
        const params = new URLSearchParams({ examType });
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        const res = await fetch(`${API_ENDPOINT}/questions?${params}`);
        const data = await res.json();
        let allItems: any[] = data.items ?? [];
        if (shuffle) allItems = shuffleArray(allItems);
        selectedItems = allItems.slice(0, limit);
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

      navigate('/exercise/session', {
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
  const countStep   = ++_s;
  const optionsStep = ++_s;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">

      {showHint && (
        <div className="fade-slide-in" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
          background: 'var(--color-hint-bg)', border: '1px solid var(--color-hint-border)',
          borderRadius: 'var(--border-radius-md)', padding: '10px var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
          <span style={{ flex: 1, lineHeight: 1.5 }}>{t('exerciseSetup.hint')}</span>
          <button
            onClick={() => { localStorage.setItem('sherpaExerciseHint', '1'); setShowHint(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 'var(--spacing-lg)' }}>

        {/* 左：設定フォーム */}
        <Card padding="var(--spacing-xl)">
          {/* 試験種別（ホームで固定されている場合は表示のみ） */}
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
                  <Button key={et} variant={examType === et ? 'primary' : 'outline'} size="sm"
                    onClick={() => handleSelectExamInSetup(et)} style={{ width: 72 }}>
                    {et}
                  </Button>
                ))}
              </div>
            </StepRow>
          )}

          {/* ドメインフィルタ */}
          <StepRow n={domainStep}
            title={<>{t('exerciseSetup.domain')} <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('exerciseSetup.optional')}</span></>}>
            <DomainSelector
              domains={EXAM_DOMAINS[examType]}
              selected={selectedDomains}
              onChange={setSelectedDomains}
              lang={lang}
              noMargin
            />
          </StepRow>

          {/* 問題数 */}
          <StepRow n={countStep} title={t('exerciseSetup.questionCount')}>
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
          </StepRow>

          {/* オプション */}
          <StepRow n={optionsStep} isLast title={t('exerciseSetup.options')}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                {t('exerciseSetup.shuffle')}
              </label>
            </div>
          </StepRow>

          {/* 中断中セッション通知 */}
          {hasDraft && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-md)',
              padding: '12px var(--spacing-md)', marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)',
              background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 'var(--border-radius-md)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <span style={{ fontSize: 18 }}>⏸</span>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: '#92400e' }}>{t('exerciseSetup.resumeNotice')}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: '#b45309' }}>{t('exerciseSetup.resumeNoticeDesc')}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={resumeSession} style={{ borderColor: '#f59e0b', color: '#92400e', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {t('exerciseSetup.resume')} →
              </Button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => navigate('/')}>
              {t('exerciseSetup.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={startSession}
              disabled={loading || availableCount === 0}
              style={{ minWidth: 120 }}
            >
              {loading ? t('exerciseSetup.starting') : t('exerciseSetup.start')}
            </Button>
          </div>
        </Card>

        {/* 右：タグフィルター + 成績パネル */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

        {/* 成績パネル */}
        <Card padding="var(--spacing-lg)">

          {/* 学習進捗 */}
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-sm)' }}>
              {lang === 'ja' ? '学習進捗' : 'Progress'} — {examType}
            </div>
            {!user ? (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'ログインすると進捗を確認できます' : 'Log in to view your progress'}
              </div>
            ) : answeredCount === null ? (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>...</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('exerciseSetup.answered')}</span>
                  <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {answeredCount}<span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, color: 'var(--color-text-sub)' }}> / {info.totalQuestions} {t('exerciseSetup.qUnit')}</span>
                  </span>
                </div>
                <div style={{ background: 'var(--color-border)', borderRadius: 10, height: 6, overflow: 'hidden', marginBottom: 4 }}>
                  <div style={{
                    width: `${info.totalQuestions > 0 ? Math.min(100, Math.round((answeredCount / info.totalQuestions) * 100)) : 0}%`,
                    background: 'var(--color-primary)', height: '100%', borderRadius: 10, transition: 'width 0.4s',
                  }} />
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', textAlign: 'right', fontWeight: 700, marginBottom: 'var(--spacing-sm)' }}>
                  {info.totalQuestions > 0 ? Math.min(100, Math.round((answeredCount / info.totalQuestions) * 100)) : 0}%
                </div>
              </>
            )}
          </div>

          {/* 苦手ドメイン トップ3 */}
          {user && (
            <div style={{ marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-xs)' }}>
                {lang === 'ja' ? '苦手ドメイン' : 'Weakest Domains'}
              </div>
              {answeredCount === null ? (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>...</div>
              ) : answeredCount <= 10 ? (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
                  {lang === 'ja' ? `回答数が足りません（${answeredCount}問）` : `Not enough answers (${answeredCount} answered)`}
                </div>
              ) : (() => {
                const ranked = EXAM_DOMAINS[examType]
                  .map(d => {
                    const s = domainStats.find(x => x.tagId === d);
                    const correct = s?.correctCount ?? 0;
                    const incorrect = s?.incorrectCount ?? 0;
                    const total = correct + incorrect;
                    const rate = total > 0 ? correct / total : null;
                    return { d, rate };
                  })
                  .filter(x => x.rate !== null)
                  .sort((a, b) => a.rate! - b.rate!)
                  .slice(0, 3);
                if (ranked.length === 0) return <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>{lang === 'ja' ? 'データなし' : 'No data'}</div>;
                return (
                  <>
                    {ranked.map(({ d, rate }, i) => (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', width: 14, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-main)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                        </span>
                        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-danger)', flexShrink: 0 }}>
                          {Math.round(rate! * 100)}%
                        </span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          )}
        </Card>

        </div>{/* 右カラム終了 */}

      </div>
    </div>
  );
}
