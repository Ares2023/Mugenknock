import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_DOMAINS, PASS_SCORES, DOMAIN_NAME_EN } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

const StepBadge = ({ n, optional = false }: { n: number; optional?: boolean }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
    background: optional ? 'var(--color-border)' : 'var(--color-primary)',
    color: optional ? 'var(--color-text-sub)' : 'white',
    fontSize: 11, fontWeight: 700,
  }}>{n}</span>
);

const EXAM_INFO: Record<string, {
  fullName: string;
  examCode: string;
  timeLimit: string;
  totalQuestions: number;
  scoredQuestions: number;
  categories: { name: string; ratio: string }[];
}> = {
  CLF: {
    fullName: 'AWS Certified Cloud Practitioner',
    examCode: 'CLF-C02',
    timeLimit: '90分',
    totalQuestions: 65,
    scoredQuestions: 50,
    categories: [
      { name: 'クラウドのコンセプト', ratio: '24%' },
      { name: 'セキュリティとコンプライアンス', ratio: '30%' },
      { name: 'クラウドテクノロジーとサービス', ratio: '34%' },
      { name: '請求・料金・サポート', ratio: '12%' },
    ],
  },
  SAA: {
    fullName: 'AWS Certified Solutions Architect – Associate',
    examCode: 'SAA-C03',
    timeLimit: '130分',
    totalQuestions: 65,
    scoredQuestions: 65,
    categories: [
      { name: 'セキュアなアーキテクチャの設計', ratio: '30%' },
      { name: '弾力性に優れたアーキテクチャの設計', ratio: '26%' },
      { name: '高パフォーマンスなアーキテクチャの設計', ratio: '24%' },
      { name: 'コスト最適化されたアーキテクチャの設計', ratio: '20%' },
    ],
  },
  SAP: {
    fullName: 'AWS Certified Solutions Architect – Professional',
    examCode: 'SAP-C02',
    timeLimit: '180分',
    totalQuestions: 75,
    scoredQuestions: 65,
    categories: [
      { name: '組織の複雑さに対応したソリューションの設計', ratio: '26%' },
      { name: '新しいソリューションの設計', ratio: '29%' },
      { name: '既存ソリューションの継続的改善', ratio: '25%' },
      { name: 'ワークロードの移行とモダナイゼーション', ratio: '20%' },
    ],
  },
  DOP: {
    fullName: 'AWS Certified DevOps Engineer – Professional',
    examCode: 'DOP-C02',
    timeLimit: '180分',
    totalQuestions: 75,
    scoredQuestions: 65,
    categories: [
      { name: 'SDLCの自動化', ratio: '22%' },
      { name: '設定管理とIaC', ratio: '17%' },
      { name: '耐障害性の高いクラウドソリューションの設計と実装', ratio: '15%' },
      { name: 'モニタリングとロギング', ratio: '15%' },
      { name: 'インシデントおよびイベントへの対応', ratio: '14%' },
      { name: 'セキュリティとコンプライアンス', ratio: '17%' },
    ],
  },
};

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
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => loadExercisePrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').domains ?? []);
  const [selectedTag, setSelectedTag] = useState<string>(() => loadExercisePrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').tag ?? '');
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

  const info = EXAM_INFO[examType];
  const passScore = PASS_SCORES[examType];
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [answeredCount, setAnsweredCount] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const prefs = loadExercisePrefs(examType);
    setSelectedDomains(prefs.domains ?? []);
    setSelectedTag(prefs.tag ?? '');
    setLimit(prefs.limit ?? 10);
    setShuffle(prefs.shuffle ?? false);
    setBookmarkOnly(prefs.bookmarkOnly ?? false);
    setUnansweredOnly(prefs.unansweredOnly ?? false);
    setIncorrectOnly(prefs.incorrectOnly ?? false);
  }, [examType]);

  useEffect(() => {
    saveExercisePrefs(examType, { domains: selectedDomains, tag: selectedTag, limit, shuffle, bookmarkOnly, unansweredOnly, incorrectOnly });
  }, [examType, selectedDomains, selectedTag, limit, shuffle, bookmarkOnly, unansweredOnly, incorrectOnly]);

  useEffect(() => {
    setAvailableCount(null);
    setAnsweredCount(null);

    const fetchCounts = async () => {
      try {
        const params = new URLSearchParams({ examType });
        if (selectedDomains.length > 0) params.set('domain', selectedDomains.join(','));
        if (selectedTag) params.set('tagId', selectedTag);

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
    } else {
      setAnsweredCount(0);
    }
  }, [examType, selectedDomains, selectedTag, user, bookmarkOnly, unansweredOnly, incorrectOnly]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/tags?examType=${examType}`)
      .then(r => r.json())
      .then(d => setAvailableTags(d.tags || []))
      .catch(() => setAvailableTags([]));
  }, [examType]);

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
    setLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      let selectedItems: any[];

      if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
        const params = new URLSearchParams({ examType });
        if (selectedDomains.length > 0) params.set('domain', selectedDomains.join(','));
        if (selectedTag) params.set('tagId', selectedTag);

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
        const params = new URLSearchParams({ examType, limit: String(limit), shuffle: String(shuffle) });
        if (selectedDomains.length > 0) params.set('domain', selectedDomains.join(','));
        if (selectedTag) params.set('tagId', selectedTag);
        const res = await fetch(`${API_ENDPOINT}/questions?${params}`);
        const data = await res.json();
        selectedItems = data.items;
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
  const tagStep     = availableTags.length > 0 ? ++_s : null;
  const countStep   = ++_s;
  const optionsStep = ++_s;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">

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

      <h1 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-xs)', color: 'var(--color-text-main)' }}>
        {t('exerciseSetup.title')}
      </h1>
      <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', margin: '0 0 var(--spacing-lg)', lineHeight: 1.6 }}>
        {t('exerciseSetup.description')}
      </p>

      <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: 'var(--spacing-lg)' }}>

        {/* 左：設定フォーム */}
        <Card title={t('exerciseSetup.params')} padding="var(--spacing-xl)">
          {/* 試験種別 */}
          {targetExam ? (
            <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
              <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-sub)' }}>{t('exerciseSetup.examType')}</span>
              <Badge variant="secondary">{examType}</Badge>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>{t('exerciseSetup.examTypeHome')}</span>
            </div>
          ) : (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
                <StepBadge n={examStep!} />{t('exerciseSetup.examType')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                {EXAM_TYPES.map(et => (
                  <Button
                    key={et}
                    variant={examType === et ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => handleSelectExamInSetup(et)}
                    style={{ width: 72 }}
                  >
                    {et}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* ドメインフィルタ */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
              <StepBadge n={domainStep} />{t('exerciseSetup.domain')} <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('exerciseSetup.optional')}</span>
            </label>
            <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', padding: 'var(--spacing-sm) var(--spacing-md)', borderBottom: '1px solid var(--color-border)' }}>
                <input type="checkbox" checked={selectedDomains.length === 0} onChange={() => { if (selectedDomains.length > 0) setSelectedDomains([]); }} style={{ width: 15, height: 15 }} />
                {t('exerciseSetup.all')}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 'var(--spacing-xs) var(--spacing-md)' }}>
                {EXAM_DOMAINS[examType].map(d => {
                  const isAll = selectedDomains.length === 0;
                  const checked = isAll || selectedDomains.includes(d);
                  return (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)', padding: '3px 0 3px 8px' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (isAll) {
                            setSelectedDomains(EXAM_DOMAINS[examType].filter(x => x !== d));
                          } else {
                            const next = checked ? selectedDomains.filter(x => x !== d) : [...selectedDomains, d];
                            setSelectedDomains(next.length === EXAM_DOMAINS[examType].length ? [] : next);
                          }
                        }}
                        style={{ width: 16, height: 16, flexShrink: 0 }}
                      />
                      <span style={{ color: checked ? 'var(--color-primary)' : 'var(--color-text-main)', fontWeight: checked ? 600 : 400 }}>
                        {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* タグフィルタ */}
          {availableTags.length > 0 && (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
                <StepBadge n={tagStep!} />{t('exerciseSetup.tag')} <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('exerciseSetup.optional')}</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                <Button
                  variant={selectedTag === '' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedTag('')}
                >
                  {t('exerciseSetup.all')}
                </Button>
                {availableTags.map(tag => (
                  <Button
                    key={tag}
                    variant={selectedTag === tag ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 問題数 */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
              <StepBadge n={countStep} />{t('exerciseSetup.questionCount')}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
              <input type="number" value={limit} onChange={e => setLimit(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={availableCount ?? 50}
                style={{
                  padding: '8px 12px', width: 100,
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--border-radius-md)',
                  fontSize: 'var(--font-size-base)', outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
                {availableCount !== null ? t('exerciseSetup.maxQ', { n: availableCount }) : t('exerciseSetup.loading')}
              </span>
            </div>
          </div>

          {/* オプション */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
              <StepBadge n={optionsStep} />{t('exerciseSetup.options')}
            </label>
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
          </div>

          {/* 中断中セッション通知 */}
          {hasDraft && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-md)',
              padding: '12px var(--spacing-md)', marginBottom: 'var(--spacing-md)',
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

        {/* 右：試験情報パネル（サブ） */}
        <Card padding="var(--spacing-lg)" style={{ border: '2px solid var(--color-border)', height: '100%' }}>
          {/* 試験ヘッダー */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
            <Badge variant="secondary">{examType}</Badge>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{info.examCode}</span>
          </div>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: '0 0 var(--spacing-lg)', color: 'var(--color-text-main)', lineHeight: 1.4 }}>{info.fullName}</h3>

          {/* ── 試験概要 ── */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-sm)' }}>{t('exerciseSetup.overview')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--color-border)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--color-bg-white)', padding: '10px 12px' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 4 }}>{t('exerciseSetup.totalQuestions')}</div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>{info.totalQuestions}<span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, marginLeft: 2 }}>{t('exerciseSetup.qUnit')}</span></div>
                {info.scoredQuestions < info.totalQuestions && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 2 }}>{t('exerciseSetup.scored')} {info.scoredQuestions}{t('exerciseSetup.qUnit')}</div>
                )}
              </div>
              <div style={{ background: 'var(--color-bg-white)', padding: '10px 12px' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 4 }}>{t('exerciseSetup.timeLimit')}</div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>{info.timeLimit}</div>
              </div>
              <div style={{ background: 'var(--color-bg-white)', padding: '10px 12px' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 4 }}>{t('exerciseSetup.passScore')}</div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-success)' }}>{passScore}</div>
              </div>
            </div>
          </div>

          {/* ── あなたの進捗 ── */}
          <div style={{ marginBottom: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-light)', borderRadius: 'var(--border-radius-md)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-sm)' }}>{t('exerciseSetup.progress')}</div>
            {answeredCount === null ? (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('exerciseSetup.loadingProgress')}</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--spacing-xs)' }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>{t('exerciseSetup.answered')}</span>
                  <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {answeredCount}
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, color: 'var(--color-text-sub)' }}> / {info.totalQuestions} {t('exerciseSetup.qUnit')}</span>
                  </span>
                </div>
                <div style={{ background: 'rgba(0,140,140,0.1)', borderRadius: 10, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    width: `${info.totalQuestions > 0 ? Math.min(100, Math.round((answeredCount / info.totalQuestions) * 100)) : 0}%`,
                    background: 'var(--color-primary)', height: '100%', borderRadius: 10, transition: 'width 0.4s'
                  }} />
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', marginTop: 4, textAlign: 'right', fontWeight: 700 }}>
                  {info.totalQuestions > 0 ? Math.min(100, Math.round((answeredCount / info.totalQuestions) * 100)) : 0}%
                </div>
              </>
            )}
          </div>

          {/* ── 今回の出題 ── */}
          {(() => {
            const hasFilter = bookmarkOnly || unansweredOnly || incorrectOnly;
            let bg = 'var(--color-bg-main)';
            let border = 'var(--color-border)';
            let color = 'var(--color-primary)';

            if (unansweredOnly && bookmarkOnly) {
              bg = '#f0fff4'; border = '#b7ebc8'; color = '#1d7a3d';
            } else if (unansweredOnly) {
              bg = '#f0fff4'; border = '#b7ebc8'; color = '#1d7a3d';
            } else if (incorrectOnly && bookmarkOnly) {
              bg = '#fff5f5'; border = '#fecaca'; color = '#dc2626';
            } else if (incorrectOnly) {
              bg = '#fff5f5'; border = '#fecaca'; color = '#dc2626';
            } else if (bookmarkOnly) {
              bg = '#fffbf0'; border = '#ffe8a0'; color = '#b85c00';
            }

            const label = (() => {
              if (unansweredOnly && bookmarkOnly) return t('exerciseSetup.unansweredBookmark');
              if (unansweredOnly) return t('exerciseSetup.unansweredLabel');
              if (incorrectOnly && bookmarkOnly) return t('exerciseSetup.incorrectBookmark');
              if (incorrectOnly) return t('exerciseSetup.incorrectLabel');
              if (bookmarkOnly) return t('exerciseSetup.bookmarkLabel');
              return selectedDomains.length > 0 || selectedTag ? t('exerciseSetup.filteredCount') : t('exerciseSetup.siteCount');
            })();
            return (
              <div style={{ marginBottom: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: bg, border: `1px solid ${border}`, borderRadius: 'var(--border-radius-md)' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-sm)' }}>{t('exerciseSetup.thisSession')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>{label}</span>
                  <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color }}>
                    {availableCount === null ? '...' : availableCount}
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, marginLeft: 4 }}>{t('exerciseSetup.qUnit')}</span>
                  </span>
                </div>
                {(selectedDomains.length > 0 || selectedTag) && availableCount !== null && !hasFilter && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginTop: 4 }}>
                    {selectedDomains.length > 0 && <span style={{ marginRight: 'var(--spacing-sm)' }}>{selectedDomains.map(d => lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d).join(', ')}</span>}
                    {selectedTag && <span>{selectedTag}</span>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── 出題範囲と比率 ── */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>{t('exerciseSetup.distribution')}</div>
            {info.categories.map(cat => (
              <div key={cat.name} style={{ marginBottom: 'var(--spacing-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)', marginBottom: 4 }}>
                  <span style={{ color: selectedDomains.includes(cat.name) ? 'var(--color-primary)' : 'var(--color-text-main)', fontWeight: selectedDomains.includes(cat.name) ? 700 : 400 }}>
                    {lang === 'en' ? (DOMAIN_NAME_EN[cat.name] ?? cat.name) : cat.name}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', flexShrink: 0, marginLeft: 'var(--spacing-sm)' }}>{cat.ratio}</span>
                </div>
                <div style={{ background: 'var(--color-border)', borderRadius: 10, height: 4 }}>
                  <div style={{ background: selectedDomains.includes(cat.name) ? 'var(--color-primary)' : 'var(--color-text-light)', borderRadius: 10, height: 4, width: cat.ratio }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  );
}
