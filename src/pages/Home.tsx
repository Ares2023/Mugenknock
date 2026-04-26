import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, DOMAIN_NAME_EN, PASS_SCORES } from '../constants';
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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">

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
              ? 'Pick your target exam, then start with Exercise or Mock Exam. You can copy any question in one click.'
              : '目標資格を選んで演習・模試を始めましょう。問題文はワンクリックでコピーできます。'}
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
        {/* タイトル */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
          <span style={{ color: 'var(--color-primary)', display: 'flex' }}><IconTarget /></span>
          <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)' }}>{t('home.targetExam')}</span>
        </div>

        {/* 試験選択ボタン（横並び） */}
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap', marginBottom: 'var(--spacing-md)' }}>
          {EXAM_TYPES.map(et => {
            const selected = targetExam === et;
            return (
              <Button
                key={et}
                variant={selected ? 'primary' : 'outline'}
                size="sm"
                onClick={() => handleSelectExam(et)}
                style={{ width: 72 }}
              >
                {et}
              </Button>
            );
          })}
        </div>

        {/* 資格情報エリア */}
        {cfg && targetExam ? (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }} className="fade-slide-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
              <Badge variant="secondary">{targetExam}</Badge>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{EXAM_LEVEL[targetExam]}</span>
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 'var(--spacing-sm)' }}>{cfg.fullName}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-md)', lineHeight: 1.5 }}>{examDesc[targetExam]}</div>
            <div style={{ display: 'flex', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', flexWrap: 'wrap', marginBottom: 'var(--spacing-md)' }}>
              <span>{t('home.examCode')}: <strong style={{ color: 'var(--color-text-main)' }}>{cfg.examCode}</strong></span>
              <span>{t('home.questionCount')}: <strong style={{ color: 'var(--color-text-main)' }}>{cfg.totalQuestions}{lang === 'ja' ? '問' : ' Q'}</strong></span>
              <span>{t('home.timeLimit')}: <strong style={{ color: 'var(--color-text-main)' }}>{cfg.timeLimitMin}{lang === 'ja' ? '分' : ' min'}</strong></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {t('home.passingScore')}: <strong style={{ color: 'var(--color-text-main)' }}>{PASS_SCORES[targetExam]}</strong>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', background: 'var(--color-bg-main)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 5px' }}>
                  {t('home.passingScoreNote')}
                </span>
              </span>
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
          <div style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 'var(--spacing-md)',
          }}>
            <div style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--border-radius-md)',
              padding: 'var(--spacing-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--spacing-sm)',
              minHeight: 88,
              color: 'var(--color-text-light)',
              background: 'var(--color-bg-sub, rgba(0,0,0,0.02))',
            }}>
              <span style={{ fontSize: 20, opacity: 0.35 }}>☁️</span>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontStyle: 'italic', textAlign: 'center' }}>
                {lang === 'ja' ? '資格を選択すると詳細情報が表示されます' : 'Select a certification to view details'}
              </p>
            </div>
          </div>
        )}
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
