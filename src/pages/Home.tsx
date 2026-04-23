import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, DOMAIN_NAME_EN } from '../constants';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { IconPencil, IconClock, IconTarget } from '../components/Icons';

const TARGET_EXAM_KEY = 'targetExam';

const EXAM_LEVEL: Record<string, string> = { CLF: 'Foundational', SAA: 'Associate', SAP: 'Professional', DOP: 'Professional' };

const EXAM_DESC_JA: Record<string, string> = {
  CLF: 'クラウドの基礎を問う入門レベルの認定',
  SAA: '最も人気の高いアソシエイトレベル認定',
  SAP: '高度な設計スキルを証明するプロ認定',
  DOP: '開発・運用の高度なスキルを証明するプロ認定',
};
const EXAM_DESC_EN: Record<string, string> = {
  CLF: 'Foundational certification covering cloud basics',
  SAA: 'Most popular associate-level AWS certification',
  SAP: 'Professional certification for advanced architects',
  DOP: 'Professional certification for DevOps engineers',
};

export default function Home() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const name = user?.email?.split('@')[0] ?? '';
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(TARGET_EXAM_KEY));
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('sherpaOnboarded'));

  const dismissOnboarding = () => {
    localStorage.setItem('sherpaOnboarded', '1');
    setShowOnboarding(false);
  };

  const handleSelectExam = (et: string) => {
    if (targetExam === et) {
      localStorage.removeItem(TARGET_EXAM_KEY);
      setTargetExam(null);
    } else {
      localStorage.setItem(TARGET_EXAM_KEY, et);
      setTargetExam(et);
    }
  };

  const cfg = targetExam ? EXAM_CONFIGS[targetExam] : null;
  const domains = targetExam ? EXAM_DOMAINS[targetExam] : [];
  const examDesc = lang === 'en' ? EXAM_DESC_EN : EXAM_DESC_JA;

  const modes = [
    { title: t('home.exerciseTitle'), description: t('home.exerciseDesc'), path: '/exercise/setup', label: t('home.exerciseLabel'), icon: <IconPencil size={22} /> },
    { title: t('home.examTitle'),     description: t('home.examDesc'),     path: '/exam/setup',     label: t('home.examLabel'),     icon: <IconClock size={22} /> },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">

      {/* オンボーディング：初回のみ表示する一時的な案内 */}
      {showOnboarding && (
        <div className="fade-slide-in" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
          background: 'var(--color-hint-bg)', border: '1px solid var(--color-hint-border)',
          borderRadius: 'var(--border-radius-md)', padding: '10px var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
          <span style={{ flex: 1, lineHeight: 1.5 }}>
            {lang === 'en'
              ? 'Pick your target exam, then start with Exercise or Mock Exam. Copy any question in one click to ask your AI assistant.'
              : '目標資格を選んで演習・模試を始めましょう。問題文はワンクリックでコピーしてAIに質問できます。'}
          </span>
          <button
            onClick={dismissOnboarding}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-light)', fontSize: 18, lineHeight: 1,
              padding: '0 4px', flexShrink: 0, display: 'flex', alignItems: 'center',
            }}
            title={lang === 'en' ? 'Dismiss' : '閉じる'}
          >
            ✕
          </button>
        </div>
      )}

      {/* 目標資格プレート */}
      <Card style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="home-exam-panel" style={{ display: 'flex', gap: 'var(--spacing-xl)', alignItems: 'flex-start' }}>

          {/* 左：試験選択ボタン（縦積み） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-xs)' }}>
              <span style={{ color: 'var(--color-primary)', display: 'flex' }}><IconTarget /></span>
              <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)' }}>{t('home.targetExam')}</span>
            </div>
            {EXAM_TYPES.map(et => {
              const selected = targetExam === et;
              return (
                <div key={et} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                  <Button
                    variant={selected ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => handleSelectExam(et)}
                    style={{ width: 72, flexShrink: 0 }}
                  >
                    {et}
                  </Button>
                  <span className="home-exam-btn-desc" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.4 }}>{examDesc[et]}</span>
                </div>
              );
            })}
            {targetExam && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectExam(targetExam)}
                style={{ marginTop: 'var(--spacing-xs)', color: 'var(--color-text-light)' }}
              >
                {t('home.clear')}
              </Button>
            )}
          </div>

          {/* 右：選択中の資格情報 */}
          <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--color-border)', paddingLeft: 'var(--spacing-xl)' }} className="home-exam-info">
            {cfg && targetExam ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
                  <Badge variant="secondary">{targetExam}</Badge>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{EXAM_LEVEL[targetExam]}</span>
                </div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 'var(--spacing-md)' }}>{cfg.fullName}</div>
                <div style={{ display: 'flex', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', flexWrap: 'wrap', marginBottom: 'var(--spacing-lg)' }}>
                  <span>{t('home.examCode')}: <strong style={{ color: 'var(--color-text-main)' }}>{cfg.examCode}</strong></span>
                  <span>{t('home.questionCount')}: <strong style={{ color: 'var(--color-text-main)' }}>{cfg.totalQuestions}{lang === 'ja' ? '問' : ' Q'}</strong></span>
                  <span>{t('home.timeLimit')}: <strong style={{ color: 'var(--color-text-main)' }}>{cfg.timeLimitMin}{lang === 'ja' ? '分' : ' min'}</strong></span>
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-sm)' }}>{t('home.domains')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                  {domains.map(d => (
                    <Badge key={d} variant="neutral">
                      {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>{t('home.selectHint')}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 演習・模試カード（左右2列） */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' }} className="home-modes-grid">
        {modes.map(f => (
          <Card
            key={f.path}
            className="home-feature-card"
            padding="var(--spacing-lg)"
            style={{ borderTop: `3px solid var(--color-primary)`, cursor: 'pointer' }}
            onClick={() => navigate(f.path)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <span style={{ color: 'var(--color-primary)', display: 'flex', flexShrink: 0 }}>{f.icon}</span>
                <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-main)' }}>{f.title}</span>
              </div>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.5, margin: 0, flex: 1 }}>{f.description}</p>
              <Button
                variant="primary"
                onClick={e => { e.stopPropagation(); navigate(f.path); }}
                style={{ width: '100%' }}
              >
                {f.label} →
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
