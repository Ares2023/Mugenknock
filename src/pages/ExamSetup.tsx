import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, PASS_SCORES, PASS_RATE, DOMAIN_NAME_EN } from '../constants';
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

const EXAM_CATEGORIES: Record<string, { name: string; ratio: string }[]> = {
  CLF: [
    { name: 'クラウドのコンセプト', ratio: '24%' },
    { name: 'セキュリティとコンプライアンス', ratio: '30%' },
    { name: 'クラウドテクノロジーとサービス', ratio: '34%' },
    { name: '請求・料金・サポート', ratio: '12%' },
  ],
  SAA: [
    { name: 'セキュアなアーキテクチャの設計', ratio: '30%' },
    { name: '弾力性に優れたアーキテクチャの設計', ratio: '26%' },
    { name: '高パフォーマンスなアーキテクチャの設計', ratio: '24%' },
    { name: 'コスト最適化されたアーキテクチャの設計', ratio: '20%' },
  ],
  SAP: [
    { name: '組織の複雑さに対応したソリューションの設計', ratio: '26%' },
    { name: '新しいソリューションの設計', ratio: '29%' },
    { name: '既存ソリューションの継続的改善', ratio: '25%' },
    { name: 'ワークロードの移行とモダナイゼーション', ratio: '20%' },
  ],
  DOP: [
    { name: 'SDLCの自動化', ratio: '22%' },
    { name: '設定管理とIaC', ratio: '17%' },
    { name: '耐障害性の高いクラウドソリューションの設計と実装', ratio: '15%' },
    { name: 'モニタリングとロギング', ratio: '15%' },
    { name: 'インシデントおよびイベントへの対応', ratio: '14%' },
    { name: 'セキュリティとコンプライアンス', ratio: '17%' },
  ],
};

const SCORED_QUESTIONS: Record<string, number> = { CLF: 50, SAA: 65, SAP: 65, DOP: 65 };

const EXAM_PREFS_KEY = 'examPrefs';
const loadExamPrefs = (et: string) => {
  try { return JSON.parse(localStorage.getItem(EXAM_PREFS_KEY) ?? '{}')[et] ?? {}; } catch { return {}; }
};
const saveExamPrefs = (et: string, prefs: object) => {
  try {
    const stored = JSON.parse(localStorage.getItem(EXAM_PREFS_KEY) ?? '{}');
    stored[et] = prefs;
    localStorage.setItem(EXAM_PREFS_KEY, JSON.stringify(stored));
  } catch {}
};

export default function ExamSetup() {
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
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => { const et = localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA'; return loadExamPrefs(et).domains ?? EXAM_DOMAINS[et] ?? []; });
  const [selectedTag, setSelectedTag] = useState<string>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').tag ?? '');
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('sherpaExamHint'));
  const [examDraft, setExamDraft] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('examDraft') ?? 'null'); } catch { return null; }
  });
  const [bookmarkOnly, setBookmarkOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').bookmarkOnly ?? false);
  const [unansweredOnly, setUnansweredOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').unansweredOnly ?? false);
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').incorrectOnly ?? false);
  const [shuffle, setShuffle] = useState<boolean>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').shuffle ?? false);
  const hasDraft = examDraft?.examType === examType;

  const config = EXAM_CONFIGS[examType];
  const passScore = PASS_SCORES[examType];

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const prefs = loadExamPrefs(examType);
    setSelectedDomains(prefs.domains ?? EXAM_DOMAINS[examType]);
    setSelectedTag(prefs.tag ?? '');
    setBookmarkOnly(prefs.bookmarkOnly ?? false);
    setUnansweredOnly(prefs.unansweredOnly ?? false);
    setIncorrectOnly(prefs.incorrectOnly ?? false);
    setShuffle(prefs.shuffle ?? false);
  }, [examType]);

  useEffect(() => {
    saveExamPrefs(examType, { domains: selectedDomains, tag: selectedTag, bookmarkOnly, unansweredOnly, incorrectOnly, shuffle });
  }, [examType, selectedDomains, selectedTag, bookmarkOnly, unansweredOnly, incorrectOnly, shuffle]);

  const resumeExam = () => {
    if (!examDraft) return;
    navigate('/exam/session', {
      state: {
        sessionId: examDraft.sessionId,
        questions: examDraft.questions,
        userId: examDraft.userId,
        examType: examDraft.examType,
        resumeIndex: examDraft.currentIndex,
        resumeAnswers: examDraft.answers,
        resumeTimeLeft: examDraft.timeLeft,
      }
    });
  };

  useEffect(() => {
    setAvailableCount(null);

    const fetchCounts = async () => {
      if (selectedDomains.length === 0) { setAvailableCount(0); return; }
      try {
        const params = new URLSearchParams({ examType });
        const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        if (selectedTag) params.set('tagId', selectedTag);

        if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
          const userId = user.userId;
          const [qRes, bkmRes, answeredRes, incorrectRes] = await Promise.all([
            fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
            bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
            unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
            incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
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
          const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
          setAvailableCount(data.count ?? data.items?.length ?? 0);
        }
      } catch { setAvailableCount(0); }
    };

    fetchCounts();
  }, [examType, selectedDomains, selectedTag, user, bookmarkOnly, unansweredOnly, incorrectOnly]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/tags?examType=${examType}`)
      .then(r => r.json())
      .then(d => setAvailableTags(d.tags || []))
      .catch(() => setAvailableTags([]));
  }, [examType]);

  const startExam = async () => {
    if (selectedDomains.length === 0) {
      alert(lang === 'ja' ? '最低1つのドメインを選択してください' : 'Please select at least one domain');
      return;
    }
    setLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      const limit = Math.min(config.totalQuestions, availableCount ?? config.totalQuestions);
      let selectedItems: any[];

      const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
      if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
        const params = new URLSearchParams({ examType });
        if (!allSelected) params.set('domain', selectedDomains.join(','));
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
        if (shuffle) {
          for (let i = filtered.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
          }
        }
        selectedItems = filtered.slice(0, limit);
      } else {
        const params = new URLSearchParams({ examType, shuffle: String(shuffle) });
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        if (selectedTag) params.set('tagId', selectedTag);
        params.set('limit', String(limit));
        const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
        selectedItems = data.items;
      }

      if (!selectedItems || selectedItems.length === 0) {
        alert(t('examSetup.startFailed'));
        setLoading(false);
        return;
      }

      const questionIds = selectedItems.map((q: any) => q.questionId);
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType, questionIds })
      });
      const sessionData = await sessionRes.json();

      navigate('/exam/session', {
        state: { sessionId: sessionData.sessionId, questions: selectedItems, userId, examType }
      });
    } catch (err) {
      console.error(err);
      alert(t('examSetup.startFailed'));
    } finally {
      setLoading(false);
    }
  };

  const useableCount = availableCount !== null ? Math.min(config.totalQuestions, availableCount) : null;
  const allDomainsSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
  const shortage = availableCount !== null && allDomainsSelected && !selectedTag
    ? Math.max(0, config.totalQuestions - availableCount) : null;

  let _s = 0;
  const examStep    = targetExam ? null : ++_s;
  const domainStep  = ++_s;
  const tagStep     = availableTags.length > 0 ? ++_s : null;
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
          <span style={{ flex: 1, lineHeight: 1.5 }}>{t('examSetup.hint')}</span>
          <button
            onClick={() => { localStorage.setItem('sherpaExamHint', '1'); setShowHint(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: 'var(--spacing-lg)' }}>

        {/* 左：設定フォーム */}
        <Card padding="var(--spacing-xl)">
          {/* 試験種別 */}
          {targetExam ? (
            <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
              <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-sub)' }}>{t('examSetup.examType')}</span>
              <Badge variant="secondary">{examType}</Badge>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>{t('examSetup.examTypeHome')}</span>
            </div>
          ) : (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
                <StepBadge n={examStep!} />{t('examSetup.examType')}
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
          <DomainSelector
            domains={EXAM_DOMAINS[examType]}
            selected={selectedDomains}
            onChange={setSelectedDomains}
            lang={lang}
            label={
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
                <StepBadge n={domainStep} />{t('examSetup.domain')} <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('examSetup.optional')}</span>
              </label>
            }
          />

          {/* タグフィルタ */}
          {availableTags.length > 0 && (
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
                <StepBadge n={tagStep!} />{t('examSetup.tag')} <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('examSetup.optional')}</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                <Button
                  variant={selectedTag === '' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedTag('')}
                >
                  {t('examSetup.all')}
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
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: '#92400e' }}>{t('examSetup.resumeNotice')}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: '#b45309' }}>{t('examSetup.resumeNoticeDesc')}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={resumeExam} style={{ borderColor: '#f59e0b', color: '#92400e', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {t('examSetup.resume')} →
              </Button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => navigate('/')}>
              {t('examSetup.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={startExam}
              disabled={loading || availableCount === 0}
              style={{ minWidth: 120 }}
            >
              {loading ? t('examSetup.starting') : t('examSetup.start')}
            </Button>
          </div>
        </Card>

        {/* 右：試験情報パネル（サブ） */}
        <Card padding="var(--spacing-lg)" style={{ border: '2px solid var(--color-border)', height: '100%' }}>
          {/* 試験ヘッダー */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
            <Badge variant="secondary">{examType}</Badge>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{config.examCode}</span>
          </div>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: '0 0 var(--spacing-lg)', color: 'var(--color-text-main)', lineHeight: 1.4 }}>{config.fullName}</h3>

          {/* ── 試験概要 ── */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-sm)' }}>{t('examSetup.overview')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--color-border)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--color-bg-white)', padding: '10px 12px' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 4 }}>{t('examSetup.totalQuestions')}</div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>{config.totalQuestions}<span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, marginLeft: 2 }}>{t('examSetup.qUnit')}</span></div>
                {SCORED_QUESTIONS[examType] < config.totalQuestions && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 2 }}>{t('examSetup.scored')} {SCORED_QUESTIONS[examType]}{t('examSetup.qUnit')}</div>
                )}
              </div>
              <div style={{ background: 'var(--color-bg-white)', padding: '10px 12px' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 4 }}>{t('examSetup.timeLimit')}</div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>{config.timeLimitMin}<span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, marginLeft: 2 }}>{t('examSetup.minUnit')}</span></div>
              </div>
              <div style={{ background: 'var(--color-bg-white)', padding: '10px 12px' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 4 }}>{t('examSetup.passScore')}</div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-success)' }}>{passScore}</div>
              </div>
            </div>
          </div>

          {/* ── 今回の出題 ── */}
          <div style={{ marginBottom: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: shortage !== null && shortage > 0 ? '#fdf3f1' : 'var(--color-bg-main)', border: `1px solid ${shortage !== null && shortage > 0 ? 'var(--color-danger)' : 'var(--color-border)'}`, borderRadius: 'var(--border-radius-md)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-sm)' }}>{t('examSetup.thisSession')}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: shortage !== null && shortage > 0 ? 8 : 0 }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                {(() => {
                  if (unansweredOnly && bookmarkOnly) return t('exerciseSetup.unansweredBookmark');
                  if (unansweredOnly) return t('exerciseSetup.unansweredLabel');
                  if (incorrectOnly && bookmarkOnly) return t('exerciseSetup.incorrectBookmark');
                  if (incorrectOnly) return t('exerciseSetup.incorrectLabel');
                  if (bookmarkOnly) return t('exerciseSetup.bookmarkLabel');
                  return (!allDomainsSelected && selectedDomains.length > 0) || selectedTag ? t('examSetup.filteredCount') : t('examSetup.questionCount');
                })()}
              </span>
              <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
                {useableCount === null ? '...' : useableCount}
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, marginLeft: 4 }}>{t('examSetup.qUnit')}</span>
              </span>
            </div>
            {shortage !== null && shortage > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--color-danger)', borderRadius: 'var(--border-radius-md)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'white', fontWeight: 700 }}>⚠ {shortage}{t('examSetup.shortage')}</span>
              </div>
            )}
            {((!allDomainsSelected && selectedDomains.length > 0) || selectedTag) && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginTop: 6 }}>
                {!allDomainsSelected && selectedDomains.length > 0 && <span style={{ marginRight: 'var(--spacing-sm)' }}>{t('examSetup.domainLabel')}: {selectedDomains.map(d => lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d).join(', ')}</span>}
                {selectedTag && <span>{t('examSetup.tagLabel')}: {selectedTag}</span>}
              </div>
            )}
          </div>

          {/* ── 出題範囲と比率 ── */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>{t('examSetup.distribution')}</div>
            {EXAM_CATEGORIES[examType].map(cat => (
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
