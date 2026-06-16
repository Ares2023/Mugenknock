import type { Metadata } from 'next';
import Link from 'next/link';
import { CATALOG } from '@/data/awsServiceCatalog';

export const metadata: Metadata = {
  title: 'AWSサービス図鑑 | 無限ノック',
  description: 'AWS認定試験に出題される200以上のAWSサービスを一覧で確認。各サービスの概要・特徴・試験ポイントを解説。',
  openGraph: {
    title: 'AWSサービス図鑑 | 無限ノック',
    description: 'AWS認定試験に出題される200以上のAWSサービスを一覧で確認。各サービスの概要・特徴・試験ポイントを解説。',
    url: 'https://mugenknock.com/services',
    siteName: '無限ノック',
  },
};

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function ServicesPage() {
  const allServices = CATALOG.flatMap(c => c.services.map(s => ({ ...s, category: c.category })));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}AWSサービス図鑑
      </nav>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#1a1a1a' }}>
        AWSサービス図鑑
      </h1>
      <p style={{ color: '#555', marginBottom: 40, lineHeight: 1.7 }}>
        AWS認定試験に出題される主要なAWSサービスの概要・特徴・試験ポイントを解説します。
        各サービスをクリックすると詳細ページで詳しく学べます。
      </p>

      {CATALOG.map(cat => (
        <section key={cat.category} style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#232f3e', borderBottom: '2px solid #ff9900', paddingBottom: 8, marginBottom: 16 }}>
            {cat.category}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {cat.services.filter(s => s.serviceIds?.length).map(svc => (
              <Link
                key={svc.name}
                href={`/services/${toSlug(svc.name)}`}
                style={{ display: 'block', padding: '12px 16px', border: '1px solid #e0e0e0', borderRadius: 8, textDecoration: 'none', color: '#1a1a1a', background: '#fff', transition: 'border-color 0.15s' }}
              >
                {svc.icon && (
                  <img src={svc.icon} alt={svc.name} width={28} height={28} style={{ marginBottom: 8, objectFit: 'contain' }} />
                )}
                <div style={{ fontWeight: 600, fontSize: 14 }}>{svc.name}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <div style={{ marginTop: 48, padding: 24, background: '#f8f9fa', borderRadius: 12, textAlign: 'center' }}>
        <p style={{ marginBottom: 16, color: '#555' }}>AWS認定試験の練習問題を解いてスコアアップ</p>
        <Link href="/" style={{ display: 'inline-block', padding: '12px 32px', background: '#ff9900', color: '#fff', borderRadius: 24, textDecoration: 'none', fontWeight: 700, fontSize: 16 }}>
          無料で練習問題を始める →
        </Link>
      </div>
    </div>
  );
}
