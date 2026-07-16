'use client';
import React from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { useLanguage } from '../contexts/LanguageContext';
import { useIsMobile } from '../hooks/useWindowWidth';
import PageLayout from '../components/ui/PageLayout';
import { SiteArchitecture } from '../components/SiteArchitecture';

// 「Webサイトの構成図」独立ページ（/architecture）
export default function ArchitecturePage() {
  const { lang } = useLanguage();
  const ja = lang === 'ja';
  const isMobile = useIsMobile();

  return (
    <PageLayout>
      <Helmet>
        <title>Webサイトの構成図 | 無限ノック</title>
        <meta name="description" content="AWS認定試験の学習サイト「無限ノック」の技術構成図。Cloudflare Pages・API Gateway・Lambda・DynamoDB・Cognito で構築・運用されています。" />
      </Helmet>

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
  );
}
