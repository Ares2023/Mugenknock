import React, { useState, useEffect } from 'react';
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

export default function ExerciseSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const targetExam = localStorage.getItem('targetExam');
  const [examType, setExamType] = useState<string>(() => targetExam || localStorage.getItem('lastExamType') || 'SAA');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [limit, setLimit] = useState(10);
  const [shuffle, setShuffle] = useState(true);
  const [loading, setLoading] = useState(false);
  const [bookmarkOnly, setBookmarkOnly] = useState(false);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
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

  useEffect(() => {
    setSelectedDomain('');
    setSelectedTag('');
  }, [examType]);

  useEffect(() => {
    setAvailableCount(null);
    setAnsweredCount(null);

    const fetchCounts = async () => {
      try {
        const params = new URLSearchParams({ examType });
        if (selectedDomain) params.set('domain', selectedDomain);
        if (selectedTag) params.set('tagId', selectedTag);

        if (user && (bookmarkOnly || unansweredOnly)) {
          const [qRes, bkmRes, answeredRes] = await Promise.all([
            fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
            bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${user.userId}`).then(r => r.json()) : Promise.resolve(null),
            unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${user.userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
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
  }, [examType, selectedDomain, selectedTag, user, bookmarkOnly, unansweredOnly]);

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

      if (user && (bookmarkOnly || unansweredOnly)) {
        const params = new URLSearchParams({ examType });
        if (selectedDomain) params.set('domain', selectedDomain);
        if (selectedTag) params.set('tagId', selectedTag);

        const [qRes, bkmRes, answeredRes] = await Promise.all([
          fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
          bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
          unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
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
        if (shuffle) filtered = shuffleArray(filtered);
        selectedItems = filtered.slice(0, limit);
      } else {
        const params = new URLSearchParams({ examType, limit: String(limit), shuffle: String(shuffle) });
        if (selectedDomain) params.set('domain', selectedDomain);
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

  // 試験種別は項番なし（ホーム画面で設定するため）
  let _s = 0;
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

      <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--spacing-lg)' }}>

        {/* 左：設定フォーム */}
        <Card title={t('exerciseSetup.params')} padding="var(--spacing-xl)">
          {/* 試験種別（表示のみ・変更はホーム画面） */}
          <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-sub)' }}>{t('exerciseSetup.examType')}</span>
            <Badge variant="secondary">{examType}</Badge>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>{t('exerciseSetup.examTypeHome')}</span>
          </div>

          {/* ドメインフィルタ */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
              <StepBadge n={domainStep} />{t('exerciseSetup.domain')} <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('exerciseSetup.optional')}</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
              <Button
                variant={selectedDomain === '' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setSelectedDomain('')}
              >
                {t('exerciseSetup.all')}
              </Button>
              {EXAM_DOMAINS[examType].map(d => (
                <Button
                  key={d}
                  variant={selectedDomain === d ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDomain(selectedDomain === d ? '' : d)}
                >
                  {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                </Button>
              ))}
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
            <div style={{ padding: 'var(--spacing-md)', background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
              {user && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                  <input type="checkbox" checked={unansweredOnly} onChange={e => setUnansweredOnly(e.target.checked)} style={{ width: 18, height: 18 }} />
                  <span style={{ fontWeight: 700 }}>
                    {t('exerciseSetup.unansweredOnly')}
                    <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginLeft: 'var(--spacing-sm)' }}>{t('exerciseSetup.unansweredOnlyDesc')}</span>
                  </span>
                </label>
              )}
              {user && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                  <input type="checkbox" checked={bookmarkOnly} onChange={e => setBookmarkOnly(e.target.checked)} style={{ width: 18, height: 18 }} />
                  <span style={{ fontWeight: 700 }}>
                    {t('exerciseSetup.bookmarkOnly')}
                    <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginLeft: 'var(--spacing-sm)' }}>{t('exerciseSetup.bookmarkOnlyDesc')}</span>
                  </span>
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} style={{ width: 18, height: 18 }} />
                <span style={{ fontWeight: 700 }}>{t('exerciseSetup.shuffle')}</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => navigate('/')}>
              {t('exerciseSetup.cancel')}
            </Button>
            {hasDraft && (
              <Button variant="outline" onClick={resumeSession} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--color-primary)', color: 'white', borderRadius: 4, padding: '1px 5px' }}>
                  {t('exerciseSetup.resumeBadge')}
                </span>
                {t('exerciseSetup.resume')}
              </Button>
            )}
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
        <Card padding="var(--spacing-lg)" style={{ background: 'transparent', boxShadow: 'none', height: '100%' }}>
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
            const hasFilter = bookmarkOnly || unansweredOnly;
            let bg = 'var(--color-bg-main)';
            let border = 'var(--color-border)';
            let color = 'var(--color-primary)';
            
            if (unansweredOnly && bookmarkOnly) {
              bg = '#f0fff4'; border = '#b7ebc8'; color = '#1d7a3d';
            } else if (unansweredOnly) {
              bg = '#f0fff4'; border = '#b7ebc8'; color = '#1d7a3d';
            } else if (bookmarkOnly) {
              bg = '#fffbf0'; border = '#ffe8a0'; color = '#b85c00';
            }

            const label = (() => {
              if (unansweredOnly && bookmarkOnly) return t('exerciseSetup.unansweredBookmark');
              if (unansweredOnly) return t('exerciseSetup.unansweredLabel');
              if (bookmarkOnly) return t('exerciseSetup.bookmarkLabel');
              return selectedDomain || selectedTag ? t('exerciseSetup.filteredCount') : t('exerciseSetup.siteCount');
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
                {(selectedDomain || selectedTag) && availableCount !== null && !hasFilter && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginTop: 4 }}>
                    {selectedDomain && <span style={{ marginRight: 'var(--spacing-sm)' }}>{lang === 'en' ? (DOMAIN_NAME_EN[selectedDomain] ?? selectedDomain) : selectedDomain}</span>}
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
                  <span style={{ color: selectedDomain === cat.name ? 'var(--color-primary)' : 'var(--color-text-main)', fontWeight: selectedDomain === cat.name ? 700 : 400 }}>
                    {lang === 'en' ? (DOMAIN_NAME_EN[cat.name] ?? cat.name) : cat.name}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', flexShrink: 0, marginLeft: 'var(--spacing-sm)' }}>{cat.ratio}</span>
                </div>
                <div style={{ background: 'var(--color-border)', borderRadius: 10, height: 4 }}>
                  <div style={{ background: selectedDomain === cat.name ? 'var(--color-primary)' : 'var(--color-text-light)', borderRadius: 10, height: 4, width: cat.ratio }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  );
}
