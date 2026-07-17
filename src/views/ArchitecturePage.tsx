'use client';
import React from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useIsMobile } from '../hooks/useWindowWidth';
import { IconUser } from '../components/Icons';
import PageLayout from '../components/ui/PageLayout';
import { SiteArchitecture } from '../components/SiteArchitecture';

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
        <PageLayout>
          <h1 style={{
            fontSize: isMobile ? 'var(--font-size-h2)' : 'var(--font-size-xxl)',
            fontWeight: 800, color: 'var(--color-text-main)',
            margin: '0 0 var(--spacing-lg)', letterSpacing: '-0.3px',
            borderLeft: '4px solid var(--color-accent)', paddingLeft: 'var(--spacing-sm)',
          }}>
            {ja ? 'Webサイトの構成図' : 'Site Architecture'}
          </h1>

          <SiteArchitecture ja={ja} isMobile={isMobile} />
        </PageLayout>
      </main>
    </div>
  );
}
