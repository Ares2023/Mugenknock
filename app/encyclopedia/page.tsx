import type { Metadata } from 'next';
import { Suspense } from 'react';
import PublicEncyclopedia from '@/views/PublicEncyclopedia';

export const metadata: Metadata = {
  title: 'AWSサービス図鑑｜主要AWSサービスをアイコンと一言解説で一覧 | 無限ノック',
  description: '主要なAWSサービスをカテゴリ別にアイコンと簡潔な解説で一覧。用途・特徴をまとめたAWS学習・認定試験対策のサービス図鑑です。',
  alternates: { canonical: 'https://mugenknock.com/encyclopedia/' },
  openGraph: {
    title: 'AWSサービス図鑑 | 無限ノック',
    url: 'https://mugenknock.com/encyclopedia/',
    siteName: '無限ノック',
    type: 'website',
  },
};

export default function Page() {
  return (
    <Suspense>
      <PublicEncyclopedia />
    </Suspense>
  );
}
