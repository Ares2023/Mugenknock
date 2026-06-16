import type { Metadata } from 'next';
import Link from 'next/link';
import { CATALOG } from '@/data/awsServiceCatalog';
import { API_ENDPOINT } from '@/constants';
import { notFound } from 'next/navigation';

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function generateStaticParams() {
  return CATALOG.flatMap(c =>
    c.services.filter(s => s.serviceIds?.length).map(s => ({ name: toSlug(s.name) }))
  );
}

async function getServiceDetail(serviceId: string) {
  try {
    const res = await fetch(`${API_ENDPOINT}/daily-service?serviceId=${encodeURIComponent(serviceId)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.service ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const entry = CATALOG.flatMap(c => c.services.map(s => ({ ...s, category: c.category }))).find(s => toSlug(s.name) === name);
  if (!entry) return {};
  return {
    title: `${entry.name}とは｜AWSサービス図鑑 | 無限ノック`,
    description: `AWS ${entry.name}の概要・特徴・AWS認定試験での出題ポイントを解説。${entry.category}カテゴリのサービスです。`,
    openGraph: {
      title: `${entry.name}とは｜AWSサービス図鑑 | 無限ノック`,
      url: `https://mugenknock.com/services/${name}`,
      siteName: '無限ノック',
    },
  };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const allServices = CATALOG.flatMap(c => c.services.map(s => ({ ...s, category: c.category })));
  const entry = allServices.find(s => toSlug(s.name) === name);
  if (!entry) notFound();

  // DynamoDB からサービス詳細を取得（ビルド時）
  const serviceId = entry.serviceIds?.[0];
  const detail = serviceId ? await getServiceDetail(serviceId) : null;

  // 同カテゴリの関連サービス（最大6件）
  const related = CATALOG.find(c => c.category === entry.category)?.services
    .filter(s => s.name !== entry.name && s.serviceIds?.length)
    .slice(0, 6) ?? [];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      {/* パンくず */}
      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}
        <Link href="/services" style={{ color: '#0047A3', textDecoration: 'none' }}>AWSサービス図鑑</Link>
        {' › '}{entry.name}
      </nav>

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
        {entry.icon && (
          <img src={entry.icon} alt={entry.name} width={64} height={64} style={{ objectFit: 'contain', flexShrink: 0 }} />
        )}
        <div>
          <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#fff3e0', color: '#e65100', marginBottom: 8 }}>
            {entry.category}
          </span>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, color: '#1a1a1a' }}>{entry.name}</h1>
        </div>
      </div>

      {/* サービス説明 */}
      {detail?.description ? (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#232f3e', marginBottom: 12 }}>サービス概要</h2>
          <p style={{ lineHeight: 1.8, color: '#333', fontSize: 16 }}>{detail.description}</p>
        </section>
      ) : (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#232f3e', marginBottom: 12 }}>サービス概要</h2>
          <p style={{ lineHeight: 1.8, color: '#333', fontSize: 16 }}>
            AWS {entry.name}は{entry.category}カテゴリのAWSサービスです。
            AWS認定試験で頻出のサービスのひとつです。
          </p>
        </section>
      )}

      {/* 豆知識・試験ポイント */}
      {detail?.trivia && (
        <section style={{ marginBottom: 32, padding: '20px 24px', background: '#fff8e1', borderRadius: 12, borderLeft: '4px solid #ff9900' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e65100', marginBottom: 12 }}>
            💡 試験ポイント・豆知識
          </h2>
          <p style={{ lineHeight: 1.8, color: '#333', margin: 0 }}>{detail.trivia}</p>
        </section>
      )}

      {/* 公式ドキュメントリンク */}
      {detail?.docUrl && (
        <div style={{ marginBottom: 32 }}>
          <a href={detail.docUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: '#0047A3', fontWeight: 600, fontSize: 15 }}>
            📄 AWS公式ドキュメントを見る →
          </a>
        </div>
      )}

      {/* CTA */}
      <div style={{ padding: 28, background: '#f0f7ff', borderRadius: 12, textAlign: 'center', marginBottom: 40 }}>
        <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: '#1a1a1a' }}>
          {entry.name} の問題を演習する
        </p>
        <p style={{ color: '#555', marginBottom: 20, fontSize: 14 }}>
          無限ノックのAIオリジナル問題で{entry.name}を徹底対策
        </p>
        <Link href="/" style={{ display: 'inline-block', padding: '12px 32px', background: '#ff9900', color: '#fff', borderRadius: 24, textDecoration: 'none', fontWeight: 700, fontSize: 16 }}>
          無料で練習問題を始める →
        </Link>
      </div>

      {/* 関連サービス */}
      {related.length > 0 && (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#232f3e', marginBottom: 16 }}>
            {entry.category}カテゴリの関連サービス
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {related.map(svc => (
              <Link key={svc.name} href={`/services/${toSlug(svc.name)}`}
                style={{ display: 'block', padding: '10px 14px', border: '1px solid #e0e0e0', borderRadius: 8, textDecoration: 'none', color: '#1a1a1a', fontSize: 14, fontWeight: 600 }}>
                {svc.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
