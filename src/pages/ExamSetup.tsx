import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, PASS_SCORES, PASS_RATE, DOMAIN_NAME_EN } from '../constants';
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

export default function ExamSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const targetExam = localStorage.getItem('targetExam');
  const [examType, setExamType] = useState<string>(() => targetExam || localStorage.getItem('lastExamType') || 'SAA');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('sherpaExamHint'));

  const config = EXAM_CONFIGS[examType];
  const passScore = PASS_SCORES[examType];

  useEffect(() => {
    setSelectedDomain('');
    setSelectedTag('');
  }, [examType]);

  useEffect(() => {
    setAvailableCount(null);
    const params = new URLSearchParams({ examType });
    if (selectedDomain) params.set('domain', selectedDomain);
    if (selectedTag) params.set('tagId', selectedTag);
    fetch(`${API_ENDPOINT}/questions?${params}`)
      .then(r => r.json())
      .then(d => setAvailableCount(d.count ?? d.items?.length ?? 0))
      .catch(() => setAvailableCount(0));
  }, [examType, selectedDomain, selectedTag]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/tags?examType=${examType}`)
      .then(r => r.json())
      .then(d => setAvailableTags(d.tags || []))
      .catch(() => setAvailableTags([]));
  }, [examType]);

  const startExam = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ examType, shuffle: 'true' });
      if (selectedDomain) params.set('domain', selectedDomain);
      if (selectedTag) params.set('tagId', selectedTag);
      const limit = Math.min(config.totalQuestions, availableCount ?? config.totalQuestions);
      params.set('limit', String(limit));

      const res = await fetch(`${API_ENDPOINT}/questions?${params}`);
      const data = await res.json();
      const questionIds = data.items.map((q: any) => q.questionId);

      const userId = user?.userId ?? 'guest';
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType, questionIds })
      });
      const sessionData = await sessionRes.json();

      navigate('/exam/session', {
        state: { sessionId: sessionData.sessionId, questions: data.items, userId, examType }
      });
    } catch (err) {
      console.error(err);
      alert(t('examSetup.startFailed'));
    } finally {
      setLoading(false);
    }
  };

  const useableCount = availableCount !== null ? Math.min(config.totalQuestions, availableCount) : null;
  const shortage = availableCount !== null && !selectedDomain && !selectedTag
    ? Math.max(0, config.totalQuestions - availableCount) : null;

  // Dynamic step numbering: skip exam type badge when locked
  let _s = 0;
  const examStep   = !targetExam ? ++_s : null;
  const domainStep = ++_s;
  const tagStep    = availableTags.length > 0 ? ++_s : null;

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

      <h1 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-xs)', color: 'var(--color-text-main)' }}>{t('examSetup.title')}</h1>
      <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', margin: '0 0 var(--spacing-lg)', lineHeight: 1.6 }}>
        {t('examSetup.description')}
      </p>

      <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--spacing-xl)', alignItems: 'flex-start' }}>

        {/* 左：設定フォーム */}
        <Card title={t('examSetup.params')} padding="var(--spacing-xl)">
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
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                {EXAM_TYPES.map(type => (
                  <Button
                    key={type}
                    variant={examType === type ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => { setExamType(type); localStorage.setItem('lastExamType', type); }}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* ドメインフィルタ */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>
              <StepBadge n={domainStep} optional />{t('examSetup.domain')} <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('examSetup.optional')}</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
              <Button
                variant={selectedDomain === '' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setSelectedDomain('')}
              >
                {t('examSetup.all')}
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
                <StepBadge n={tagStep!} optional />{t('examSetup.tag')} <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('examSetup.optional')}</span>
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

          <div style={{ background: 'var(--color-primary-light)', borderLeft: '4px solid var(--color-primary)', borderRadius: 'var(--border-radius-md)', padding: '12px 16px', fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 'var(--spacing-lg)' }}>
            <strong style={{ display: 'block', marginBottom: 4 }}>{t('examSetup.aboutTitle')}</strong>
            {t('examSetup.aboutDesc')}
          </div>

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)', justifyContent: 'flex-end' }}>
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

        {/* 右：試験情報パネル */}
        <Card padding="var(--spacing-lg)">
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
                {selectedDomain || selectedTag ? t('examSetup.filteredCount') : t('examSetup.questionCount')}
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
            {(selectedDomain || selectedTag) && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginTop: 6 }}>
                {selectedDomain && <span style={{ marginRight: 'var(--spacing-sm)' }}>{t('examSetup.domainLabel')}: {lang === 'en' ? (DOMAIN_NAME_EN[selectedDomain] ?? selectedDomain) : selectedDomain}</span>}
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
