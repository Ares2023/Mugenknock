import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, DOMAIN_NAME_EN } from '../constants';

const TARGET_EXAM_KEY = 'targetExam';

const IconPencil = () => (<svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>);
const IconClock = () => (<svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 2"/></svg>);
const IconChart = () => (<svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="9" width="3" height="6" rx="0.5"/><rect x="6" y="5" width="3" height="10" rx="0.5"/><rect x="11" y="2" width="3" height="13" rx="0.5"/></svg>);
const IconTarget = () => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none"/></svg>);

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

  const handleSelectExam = (et: string) => {
    if (targetExam === et) { localStorage.removeItem(TARGET_EXAM_KEY); setTargetExam(null); }
    else { localStorage.setItem(TARGET_EXAM_KEY, et); setTargetExam(et); }
  };

  const cfg = targetExam ? EXAM_CONFIGS[targetExam] : null;
  const domains = targetExam ? EXAM_DOMAINS[targetExam] : [];

  const examDesc = lang === 'en' ? EXAM_DESC_EN : EXAM_DESC_JA;

  const features = [
    { title: t('home.exerciseTitle'), description: t('home.exerciseDesc'), path: '/exercise/setup', label: t('home.exerciseLabel'), icon: <IconPencil /> },
    { title: t('home.examTitle'),     description: t('home.examDesc'),     path: '/exam/setup',     label: t('home.examLabel'),     icon: <IconClock /> },
    { title: t('home.statsTitle'),    description: t('home.statsDesc'),    path: '/stats',          label: t('home.statsLabel'),    icon: <IconChart /> },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px', color: '#16191f' }} className="page-container">
      {/* ヘッダー */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="home-hero-title" style={{ fontSize: 28, fontWeight: 700, margin: '0 0 10px', lineHeight: 1.3 }}>
          {name ? t('home.greeting', { name }) : t('home.startLearning')}
        </h1>
        <p style={{ fontSize: 14, color: '#545b64', lineHeight: 1.8, margin: 0 }}>
          {t('home.heroDesc')}
        </p>
      </div>

      {/* 目標資格プレート */}
      <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
        <div className="home-exam-panel" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* 左：試験選択ボタン（縦積み） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#008c8c', display: 'flex' }}><IconTarget /></span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#16191f' }}>{t('home.targetExam')}</span>
            </div>
            {EXAM_TYPES.map(et => {
              const selected = targetExam === et;
              return (
                <div key={et} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => handleSelectExam(et)}
                    style={{
                      width: 64, padding: '7px 0', borderRadius: 6, textAlign: 'center',
                      border: `1px solid ${selected ? '#008c8c' : '#d1d5db'}`,
                      background: selected ? '#008c8c' : 'white',
                      color: selected ? 'white' : '#545b64',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.1s', flexShrink: 0,
                    }}
                    onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = '#008c8c'; e.currentTarget.style.color = '#008c8c'; } }}
                    onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#545b64'; } }}
                  >
                    {et}
                  </button>
                  <span className="home-exam-btn-desc" style={{ fontSize: 12, color: '#545b64', lineHeight: 1.4 }}>{examDesc[et]}</span>
                </div>
              );
            })}
            {targetExam && (
              <button
                onClick={() => handleSelectExam(targetExam)}
                style={{ marginTop: 4, padding: '5px 0', width: 64, borderRadius: 6, border: '1px solid #eaeded', background: 'white', color: '#aab7b8', fontSize: 12, cursor: 'pointer' }}
              >
                {t('home.clear')}
              </button>
            )}
          </div>

          {/* 右：選択中の資格情報 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {cfg && targetExam ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ background: '#232f3e', color: 'white', fontSize: 12, padding: '2px 10px', borderRadius: 12, fontWeight: 700 }}>{targetExam}</span>
                  <span style={{ fontSize: 12, color: '#545b64', fontWeight: 700 }}>{EXAM_LEVEL[targetExam]}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#16191f', marginBottom: 10 }}>{cfg.fullName}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#545b64', flexWrap: 'wrap', marginBottom: 12 }}>
                  <span>{t('home.examCode')}: <strong style={{ color: '#16191f' }}>{cfg.examCode}</strong></span>
                  <span>{t('home.questionCount')}: <strong style={{ color: '#16191f' }}>{cfg.totalQuestions}{lang === 'ja' ? '問' : ' Q'}</strong></span>
                  <span>{t('home.timeLimit')}: <strong style={{ color: '#16191f' }}>{cfg.timeLimitMin}{lang === 'ja' ? '分' : ' min'}</strong></span>
                </div>
                <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 6 }}>{t('home.domains')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {domains.map(d => (
                    <span key={d} style={{ fontSize: 12, padding: '3px 10px', background: '#f2f3f3', borderRadius: 4, color: '#16191f', border: '1px solid #eaeded' }}>
                      {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: '#aab7b8' }}>{t('home.selectHint')}</p>
            )}
          </div>
        </div>
      </div>

      {/* 機能カード（縦積み） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
        {features.map(f => (
          <div
            key={f.path}
            className="home-feature-card"
            style={{
              background: 'white', border: '1px solid #eaeded', borderRadius: 6,
              borderLeft: '4px solid #008c8c', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)',
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
            }}
          >
            <div style={{ color: '#545b64', display: 'flex', flexShrink: 0 }}>{f.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#16191f', marginBottom: 4 }}>{f.title}</div>
              <p style={{ fontSize: 13, color: '#545b64', lineHeight: 1.6, margin: 0 }}>{f.description}</p>
            </div>
            <button
              onClick={() => navigate(f.path)}
              className="home-feature-card-btn"
              style={{
                flexShrink: 0, padding: '8px 20px', background: 'white', color: '#008c8c',
                border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', fontSize: 13,
                fontWeight: 700, transition: 'all 0.1s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e0f2f2'; e.currentTarget.style.borderColor = '#006666'; e.currentTarget.style.color = '#006666'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#008c8c'; e.currentTarget.style.color = '#008c8c'; }}
            >
              {f.label} →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
