import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS } from '../constants';

const TARGET_EXAM_KEY = 'targetExam';

type FeatureCardProps = {
  title: string;
  description: string;
  path: string;
  label: string;
  icon: React.ReactNode;
};

const FeatureCard = ({ title, description, path, label, icon }: FeatureCardProps) => {
  const navigate = useNavigate();
  return (
    <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, padding: '24px', borderTop: `4px solid #008c8c`, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#545b64', display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon}
        <span style={{ fontSize: 16, fontWeight: 700, color: '#16191f' }}>{title}</span>
      </div>
      <p style={{ fontSize: 14, color: '#545b64', lineHeight: 1.7, margin: 0 }}>{description}</p>
      <button
        onClick={() => navigate(path)}
        style={{
          marginTop: 'auto',
          padding: '8px 20px',
          background: 'white',
          color: '#008c8c',
          border: '1px solid #008c8c',
          borderRadius: 9999,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 700,
          alignSelf: 'flex-start',
          transition: 'all 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#e0f2f2'; e.currentTarget.style.borderColor = '#006666'; e.currentTarget.style.color = '#006666'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#008c8c'; e.currentTarget.style.color = '#008c8c'; }}
      >
        {label} →
      </button>
    </div>
  );
};

const IconPencil = () => (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
  </svg>
);
const IconClock = () => (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="6.5"/>
    <path d="M8 4.5V8l2.5 2"/>
  </svg>
);
const IconList = () => (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="5" y1="4" x2="14" y2="4"/>
    <line x1="5" y1="8" x2="14" y2="8"/>
    <line x1="5" y1="12" x2="14" y2="12"/>
    <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none"/>
    <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none"/>
    <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none"/>
  </svg>
);
const IconChart = () => (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="9" width="3" height="6" rx="0.5"/>
    <rect x="6" y="5" width="3" height="10" rx="0.5"/>
    <rect x="11" y="2" width="3" height="13" rx="0.5"/>
  </svg>
);
const IconTarget = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="6.5"/>
    <circle cx="8" cy="8" r="3"/>
    <circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none"/>
  </svg>
);

const EXAM_LEVEL: Record<string, string> = {
  CLF: 'Foundational',
  SAA: 'Associate',
  SAP: 'Professional',
  DOP: 'Professional',
};

export default function Home() {
  const { user } = useAuth();
  const name = user?.email?.split('@')[0] ?? '';
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(TARGET_EXAM_KEY));

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

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px', color: '#16191f' }} className="page-container">
      {/* ヒーローセクション */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.3 }}>
          {name ? `こんにちは、${name} さん` : 'AWS 資格学習を始めよう'}
        </h1>
        <p style={{ fontSize: 15, color: '#545b64', lineHeight: 1.8, margin: 0, maxWidth: 640 }}>
          AWS 認定資格の取得を目指すための練習問題サービスです。
          CLF・SAA・SAP・DOP の問題を演習・模試の2つのモードで学習できます。
        </p>
      </div>

      {/* 目標資格セレクター */}
      <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 40, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ color: '#008c8c', display: 'flex' }}><IconTarget /></span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#16191f' }}>目標資格</span>
          {targetExam && (
            <span style={{ fontSize: 12, color: '#545b64', marginLeft: 4 }}>
              — 統計・分析画面はこの資格に絞って表示されます
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EXAM_TYPES.map(et => {
            const selected = targetExam === et;
            return (
              <button
                key={et}
                onClick={() => handleSelectExam(et)}
                style={{
                  padding: '7px 20px',
                  borderRadius: 6,
                  border: `1px solid ${selected ? '#008c8c' : '#d1d5db'}`,
                  background: selected ? '#008c8c' : 'white',
                  color: selected ? 'white' : '#545b64',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = '#008c8c';
                    e.currentTarget.style.color = '#008c8c';
                  }
                }}
                onMouseLeave={e => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.color = '#545b64';
                  }
                }}
              >
                {et}
              </button>
            );
          })}
          {targetExam && (
            <button
              onClick={() => handleSelectExam(targetExam)}
              style={{
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid #eaeded',
                background: 'white',
                color: '#879596',
                fontSize: 12, cursor: 'pointer',
                marginLeft: 4,
              }}
            >
              解除
            </button>
          )}
        </div>

        {cfg && targetExam && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #eaeded', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ background: '#232f3e', color: 'white', fontSize: 12, padding: '2px 10px', borderRadius: 12, fontWeight: 700 }}>{targetExam}</span>
                <span style={{ fontSize: 12, color: '#545b64', fontWeight: 700 }}>{EXAM_LEVEL[targetExam]}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#16191f', marginBottom: 8 }}>{cfg.fullName}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#545b64' }}>
                <span>試験コード: <strong style={{ color: '#16191f' }}>{cfg.examCode}</strong></span>
                <span>問題数: <strong style={{ color: '#16191f' }}>{cfg.totalQuestions}問</strong></span>
                <span>制限時間: <strong style={{ color: '#16191f' }}>{cfg.timeLimitMin}分</strong></span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 8 }}>出題ドメイン</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {domains.map(d => (
                  <span key={d} style={{ fontSize: 12, padding: '3px 10px', background: '#f2f3f3', borderRadius: 4, color: '#16191f', border: '1px solid #eaeded' }}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {!targetExam && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#aab7b8' }}>
            資格を選択すると統計画面が絞り込まれます
          </p>
        )}
      </div>

      {/* 機能カード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 48 }}>
        <FeatureCard
          title="演習モード"
          description="試験種別やタグ・ドメインでフィルタして問題を解けます。ブックマークした問題だけを集中学習することも可能です。"
          path="/exercise/setup"
          label="演習を始める"
          icon={<IconPencil />}
        />
        <FeatureCard
          title="模試モード"
          description="本番試験に近い形式で、制限時間内に全問を解きます。途中で一時停止・再開もできます。"
          path="/exam/setup"
          label="模試を始める"
          icon={<IconClock />}
        />
        <FeatureCard
          title="問題一覧"
          description="全問題をキーワードや試験種別で検索・閲覧できます。CSV エクスポートや問題のコピーにも対応しています。"
          path="/questions"
          label="問題を見る"
          icon={<IconList />}
        />
        <FeatureCard
          title="統計・分析"
          description="試験別の演習進捗、模試のスコア推移、演習履歴を確認できます。弱点分野の把握に活用してください。"
          path="/stats"
          label="統計を見る"
          icon={<IconChart />}
        />
      </div>

      {/* 対応試験 */}
      <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, padding: '24px 32px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#16191f' }}>対応している AWS 認定試験</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { code: 'CLF', name: 'AWS Cloud Practitioner', level: 'Foundational' },
            { code: 'SAA', name: 'Solutions Architect Associate', level: 'Associate' },
            { code: 'SAP', name: 'Solutions Architect Professional', level: 'Professional' },
            { code: 'DOP', name: 'DevOps Engineer Professional', level: 'Professional' },
          ].map(exam => (
            <div
              key={exam.code}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 16px', background: targetExam === exam.code ? '#e0f2f2' : '#fbfbfb',
                borderRadius: 6, border: `1px solid ${targetExam === exam.code ? '#008c8c' : '#eaeded'}`,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ background: '#232f3e', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{exam.code}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: '#16191f' }}>{exam.name}</div>
                <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginTop: 4 }}>{exam.level}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
