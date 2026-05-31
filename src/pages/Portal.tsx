import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { IconUser, IconSun, IconMoon } from '../components/Icons';

type Cert = {
  key: string;
  label_ja: string;
  label_en: string;
  desc_ja: string;
  desc_en: string;
  sub_ja: string;
  sub_en: string;
  path: string;
  color: string;
  available: boolean;
};

const CERTS: Cert[] = [
  {
    key: 'aws',
    label_ja: 'AWS 認定資格',
    label_en: 'AWS Certifications',
    desc_ja: 'CLF・SAA・SAP など全12種の認定試験に対応',
    desc_en: 'All 12 AWS certifications including CLF, SAA, SAP and more',
    sub_ja: '12 資格対応',
    sub_en: '12 certifications',
    path: '/aws/',
    color: 'linear-gradient(135deg, #FF9900 0%, #FF6600 100%)',
    available: true,
  },
];

const COMING: { label_ja: string; label_en: string }[] = [
  { label_ja: 'GCP 認定資格', label_en: 'Google Cloud Certs' },
  { label_ja: 'Azure 認定資格', label_en: 'Microsoft Azure Certs' },
];

export default function Portal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const ja = lang === 'ja';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontFamily: 'inherit' }}>
      <Helmet>
        <title>無限ノック</title>
        <meta name="description" content="AWS認定試験（SAA・CLF・SAPなど）の無料練習問題サービス。演習・模試・サービス図鑑の3本柱でスコアアップをサポート。" />
      </Helmet>

      {/* ── ヘッダー ── */}
      <header style={{
        height: 56, minHeight: 56, background: 'var(--color-bg-white)',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 12px 0 12px' : '0 var(--spacing-lg)',
        gap: 'var(--spacing-md)', zIndex: 200, flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
      }}>
        {/* ロゴ */}
        <div style={{ display: 'flex', alignItems: 'center', userSelect: 'none', flexShrink: 0, padding: '0 4px' }}>
          <img
            src={isMobile ? '/mugen-icon.png' : '/mugen-header.png'}
            alt="MugenKnock"
            style={{ height: isMobile ? 32 : 36, width: 'auto', display: 'block' }}
          />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* 言語トグル */}
          <button
            onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
            style={{
              background: 'transparent', border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius-md)', cursor: 'pointer', color: 'var(--color-text-sub)',
              padding: '4px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 700,
            }}
          >
            {lang === 'ja' ? 'EN' : 'JA'}
          </button>
          {/* テーマトグル */}
          <button
            onClick={toggleTheme}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid var(--color-border)',
              borderRadius: '50%', cursor: 'pointer', color: 'var(--color-text-sub)',
              width: 32, height: 32, padding: 0,
            }}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          {/* アカウントボタン */}
          <button
            onClick={() => navigate(user ? '/account' : '/login')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: user ? 'var(--color-primary-light)' : 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '50%', cursor: 'pointer',
              color: user ? 'var(--color-primary)' : 'var(--color-text-sub)',
              width: 36, height: 36, padding: 0,
              fontSize: 14, fontWeight: 700,
            }}
          >
            {user?.email ? user.email[0].toUpperCase() : <IconUser />}
          </button>
        </div>
      </header>

      {/* ── メインコンテンツ ── */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? 'var(--spacing-lg) var(--spacing-md)' : 'var(--spacing-xl) var(--spacing-lg)' }}>

          {/* ── ヒーロー ── */}
          <div style={{ marginBottom: isMobile ? 24 : 32 }}>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, margin: '0 0 6px', color: 'var(--color-text-main)', letterSpacing: '-0.5px' }}>
              {ja ? '資格試験を選択' : 'Select a Certification'}
            </h1>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', margin: 0, lineHeight: 1.6 }}>
              {ja
                ? '学習したい資格試験のカテゴリを選んでください'
                : 'Choose the certification category you want to study'}
            </p>
          </div>

          {/* ── 利用可能な資格 ── */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {ja ? '利用可能' : 'Available'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 28 }}>
            {CERTS.map(cert => (
              <button
                key={cert.key}
                onClick={() => navigate(cert.path)}
                style={{
                  background: 'var(--color-bg-white)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: isMobile ? '16px' : '20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.12s',
                  boxShadow: 'var(--box-shadow-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'var(--box-shadow-sm)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* アイコン */}
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  background: cert.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900, color: 'white', letterSpacing: '-0.5px',
                }}>
                  AWS
                </div>
                {/* テキスト */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 2 }}>
                    {ja ? cert.label_ja : cert.label_en}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 4 }}>
                    {ja ? cert.desc_ja : cert.desc_en}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-light)' }}>
                    {ja ? cert.sub_ja : cert.sub_en}
                  </div>
                </div>
                {/* 矢印 */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))}
          </div>

          {/* ── 準備中 ── */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {ja ? '準備中' : 'Coming Soon'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {COMING.map((c, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--color-bg-white)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: isMobile ? '16px' : '20px',
                  display: 'flex', alignItems: 'center', gap: 16,
                  opacity: 0.55,
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  background: 'var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, color: 'var(--color-text-light)',
                }}>
                  +
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 2 }}>
                    {ja ? c.label_ja : c.label_en}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                    {ja ? '準備中' : 'In preparation'}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>

      {/* ── フッター ── */}
      <footer style={{ padding: '16px var(--spacing-lg)', textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', borderTop: '1px solid var(--color-border)' }}>
        © {new Date().getFullYear()} MugenKnock
      </footer>

    </div>
  );
}
