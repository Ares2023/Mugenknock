'use client';
import React from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useIsMobile } from '../hooks/useWindowWidth';
import { IconUser, IconClock, IconServer, IconLock } from '../components/Icons';
import PageLayout from '../components/ui/PageLayout';
import { SiteArchitecture } from '../components/SiteArchitecture';

// PC版のみ: 構成図の右側に添える補足パネル（デスクトップ幅がスカスカにならないよう
// 「なぜこの構成か」の理由と技術スタック早見表で情報量を補う）。モバイルには出さない。
const REASONS: { Icon: React.FC<{ size?: number }>; ja: string; en: string }[] = [
  { Icon: IconClock, ja: 'アクセスが無い時間帯はほぼ課金されないサーバーレス構成', en: 'Serverless — costs stay near zero when there’s no traffic' },
  { Icon: IconServer, ja: 'Cloudflareのエッジ配信で世界中どこからでも高速表示', en: 'Fast loads worldwide via Cloudflare’s edge network' },
  { Icon: IconLock, ja: 'DynamoDBは自動でスケールするためアクセス集中時も安定', en: 'DynamoDB auto-scales, staying stable even under traffic spikes' },
];

const STACK_TABLE: { ja: string; en: string; role: string; roleEn: string }[] = [
  { ja: 'Cloudflare Pages', en: 'Cloudflare Pages', role: 'フロントエンド配信', roleEn: 'Frontend hosting' },
  { ja: 'Amazon Cognito', en: 'Amazon Cognito', role: 'ユーザー認証', roleEn: 'User auth' },
  { ja: 'Amazon API Gateway', en: 'Amazon API Gateway', role: 'APIの入口', roleEn: 'API entry point' },
  { ja: 'AWS Lambda', en: 'AWS Lambda', role: 'サーバーレス処理', roleEn: 'Serverless backend' },
  { ja: 'Amazon DynamoDB', en: 'Amazon DynamoDB', role: 'データベース', roleEn: 'Database' },
];

function ArchitectureInsights({ ja }: { ja: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      <div style={{
        background: 'var(--color-bg-white)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--box-shadow-sm)',
        padding: 'var(--spacing-md)',
      }}>
        <h2 style={{ fontSize: 'var(--font-size-h3)', fontWeight: 800, margin: '0 0 var(--spacing-md)', color: 'var(--color-text-main)' }}>
          {ja ? 'なぜこの構成なのか' : 'Why this stack'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          {REASONS.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0, width: 32, height: 32, borderRadius: 'var(--border-radius-md)',
                background: 'var(--color-primary-light)', color: 'var(--color-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <r.Icon size={17} />
              </span>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.7, paddingTop: 5 }}>
                {ja ? r.ja : r.en}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: 'var(--color-bg-white)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--box-shadow-sm)',
        padding: 'var(--spacing-md)',
      }}>
        <h2 style={{ fontSize: 'var(--font-size-h3)', fontWeight: 800, margin: '0 0 var(--spacing-md)', color: 'var(--color-text-main)' }}>
          {ja ? '技術スタック早見表' : 'Tech stack at a glance'}
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
          <tbody>
            {STACK_TABLE.map((row, i) => (
              <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 8px 10px 0', fontWeight: 700, color: 'var(--color-text-main)', whiteSpace: 'nowrap' }}>
                  {ja ? row.ja : row.en}
                </td>
                <td style={{ padding: '10px 0', color: 'var(--color-text-sub)', textAlign: 'right' }}>
                  {ja ? row.role : row.roleEn}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 「Webサイトの構成図」独立ページ（/architecture）
export default function ArchitecturePage() {
  const { lang } = useLanguage();
  const ja = lang === 'ja';
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontFamily: 'inherit' }}>
      <Helmet>
        <title>Webサイトの構成図 | 無限ノック</title>
        <meta name="description" content="AWS認定試験の学習サイト「無限ノック」の技術構成図。Cloudflare Pages・API Gateway・Lambda・DynamoDB・Cognito で構築・運用されています。" />
      </Helmet>

      {/* ── ヘッダー（ランディングページと同様） ── */}
      <header style={{
        height: 56, minHeight: 56, background: 'var(--color-bg-white)',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 12px 0 8px' : '0 var(--spacing-lg)',
        gap: 'var(--spacing-md)', zIndex: 200, flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => navigate(user ? '/account' : '/login')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: user ? 'var(--color-primary-light)' : 'transparent',
              border: '1px solid var(--color-border)', borderRadius: '50%',
              cursor: 'pointer', color: user ? 'var(--color-primary)' : 'var(--color-text-sub)',
              width: 36, height: 36, padding: 0, flexShrink: 0, transition: 'background 0.2s',
              fontSize: 'var(--font-size-base)', fontWeight: 700, letterSpacing: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-main)'}
            onMouseLeave={e => e.currentTarget.style.background = user ? 'var(--color-primary-light)' : 'transparent'}
          >
            {user?.email ? user.email[0].toUpperCase() : <IconUser />}
          </button>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <PageLayout maxWidth={isMobile ? 'var(--page-max-width)' : 960}>
          <h1 style={{
            fontSize: isMobile ? 'var(--font-size-h2)' : 'var(--font-size-xxl)',
            fontWeight: 800, color: 'var(--color-text-main)',
            margin: '0 0 var(--spacing-lg)', letterSpacing: '-0.3px',
            borderLeft: '4px solid var(--color-accent)', paddingLeft: 'var(--spacing-sm)',
          }}>
            {ja ? 'Webサイトの構成図' : 'Site Architecture'}
          </h1>

          {isMobile ? (
            <SiteArchitecture ja={ja} isMobile={isMobile} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '480px 1fr', gap: 'var(--spacing-xl)', alignItems: 'start' }}>
              <SiteArchitecture ja={ja} isMobile={isMobile} maxWidth={480} />
              <ArchitectureInsights ja={ja} />
            </div>
          )}
        </PageLayout>
      </main>
    </div>
  );
}
