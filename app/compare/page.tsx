import type { Metadata } from 'next';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_ENDPOINT
  ?? 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/prod';

type Comparison = { slug: string; title: string; category?: string; services: string[] };

export const metadata: Metadata = {
  title: 'AWSサービス比較まとめ｜違いと使い分けを図解｜無限ノック',
  description: 'S3とEBSとEFS、RDSとAurora、SQSとSNSなど、紛らわしいAWSサービスの違いと使い分けを比較表つきで解説。AWS認定試験対策に。',
  openGraph: {
    title: 'AWSサービス比較まとめ｜無限ノック',
    url: 'https://mugenknock.com/compare',
    siteName: '無限ノック',
  },
};

async function fetchAll(): Promise<Comparison[]> {
  try {
    const res = await fetch(`${API}/comparisons/public`, { cache: 'force-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

export default async function CompareIndex() {
  const items = await fetchAll();

  // カテゴリごとにグループ化
  const byCat = new Map<string, Comparison[]>();
  for (const c of items) {
    const cat = c.category || 'その他';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(c);
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'AWSサービス比較まとめ',
    url: 'https://mugenknock.com/compare/',
    inLanguage: 'ja',
    hasPart: items.map(c => ({ '@type': 'TechArticle', name: c.title, url: `https://mugenknock.com/compare/${c.slug}/` })),
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}サービス比較
      </nav>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', marginBottom: 12 }}>AWSサービス比較まとめ</h1>
      <p style={{ fontSize: 16, lineHeight: 1.8, color: '#333', marginBottom: 32 }}>
        「S3とEBSは何が違う？」「RDSとAuroraはどっちを使う？」——紛らわしいAWSサービスの違いと使い分けを、
        比較表・ユースケース・AWS認定試験のポイント付きで解説します。
      </p>

      {items.length === 0 && (
        <p style={{ color: '#666' }}>比較コンテンツを準備中です。</p>
      )}

      {[...byCat.entries()].map(([cat, list]) => (
        <section key={cat} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e65100', margin: '0 0 12px', paddingBottom: 6, borderBottom: '2px solid #ffe0b2' }}>{cat}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(c => (
              <Link key={c.slug} href={`/compare/${c.slug}/`} style={{
                display: 'block', padding: '14px 18px', border: '1px solid #e0e0e0', borderRadius: 12,
                textDecoration: 'none', background: '#fff',
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0047A3', marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: '#666' }}>{c.services.join(' / ')}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
