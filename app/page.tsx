import type { Metadata } from 'next';
import { Suspense } from 'react';
import Portal from '@/views/Portal';

export const metadata: Metadata = {
  title: '無限ノック｜AWS認定試験の無料練習問題（全12資格・3,800問以上）',
  description:
    'AWS認定試験（SAA・CLF・SAPなど全12資格）の無料練習問題サービス。AI生成の本番同等問題3,800問以上、4つの学習モードとドメイン別弱点分析でスコアアップをサポート。アカウント登録なしで演習できます。',
  alternates: { canonical: 'https://mugenknock.com/' },
  openGraph: {
    title: '無限ノック｜AWS認定試験の無料練習問題',
    description: 'AWS認定試験の無料練習問題。AI生成の本番同等問題3,800問以上・全12資格対応。',
    url: 'https://mugenknock.com/',
    siteName: '無限ノック',
    type: 'website',
  },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Portal />
    </Suspense>
  );
}
