import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
    <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px', borderTop: `4px solid #008c8c`, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          borderRadius: 2,
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

export default function Home() {
  const { user } = useAuth();
  const name = user?.email?.split('@')[0] ?? '';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px', color: '#16191f' }} className="page-container">
      {/* ヒーローセクション */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ background: '#232f3e', color: 'white', fontSize: 12, padding: '3px 10px', borderRadius: 12, fontWeight: 700 }}>AWS Quiz Practice</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.3 }}>
          {name ? `こんにちは、${name} さん` : 'AWS 資格学習を始めよう'}
        </h1>
        <p style={{ fontSize: 15, color: '#545b64', lineHeight: 1.8, margin: 0, maxWidth: 640 }}>
          AWS 認定資格の取得を目指すための練習問題サービスです。
          CLF・SAA・SAP・DOP の問題を演習・模試の2つのモードで学習できます。
          左メニューから各機能にアクセスしてください。
        </p>
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
      <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px 32px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#16191f' }}>対応している AWS 認定試験</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { code: 'CLF', name: 'AWS Cloud Practitioner', level: 'Foundational' },
            { code: 'SAA', name: 'Solutions Architect Associate', level: 'Associate' },
            { code: 'SAP', name: 'Solutions Architect Professional', level: 'Professional' },
            { code: 'DOP', name: 'DevOps Engineer Professional', level: 'Professional' },
          ].map(exam => (
            <div key={exam.code} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: '#fbfbfb', borderRadius: 2, border: '1px solid #eaeded' }}>
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
