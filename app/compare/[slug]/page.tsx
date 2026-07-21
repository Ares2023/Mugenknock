import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_ENDPOINT
  ?? 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/prod';

type Axis = { axis: string; values: Record<string, string> };
type UseCase = { scenario: string; recommend: string; why: string };
type Comparison = {
  slug: string;
  title: string;
  category?: string;
  services: string[];
  examTypes?: string[];
  docUrls?: string[];
  intro: string;
  axes: Axis[];
  useCases: UseCase[];
  examPoints: string;
};

// 一覧はビルド中に何度も参照されるため cache() で1回のfetchに集約
const fetchAll = cache(async (): Promise<Comparison[]> => {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(`${API}/comparisons/public`, { signal: ctrl.signal, cache: 'force-cache' });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
});

async function fetchOne(slug: string): Promise<Comparison | null> {
  const items = await fetchAll();
  const found = items.find(c => c.slug === slug);
  if (found) return found;
  // 一覧に無い場合はslug直引きで取り直す（生成直後のキャッシュずれ対策）
  try {
    const res = await fetch(`${API}/comparisons/item?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.comparison ?? null;
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const items = await fetchAll();
  return items.map(c => ({ slug: c.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const c = await fetchOne(slug);
  if (!c) return {};
  const svcJoin = c.services.join(' / ');
  return {
    title: `${c.title}｜図解で比較｜無限ノック`,
    description: `${svcJoin} の違いと使い分けを、比較表・ユースケース・AWS認定試験のポイント付きで解説。`,
    openGraph: {
      title: `${c.title}｜無限ノック`,
      url: `https://mugenknock.com/compare/${slug}`,
      siteName: '無限ノック',
    },
  };
}

// examType → 正式名（内部リンクのラベル）。無限ノックの試験種別に対応。
const EXAM_LABEL: Record<string, string> = {
  CLF: 'CLF（クラウドプラクティショナー）', AIF: 'AIF（AIプラクティショナー）',
  SAA: 'SAA（ソリューションアーキテクト アソシエイト）', DVA: 'DVA（デベロッパー アソシエイト）',
  SOA: 'SOA（SysOps アドミニストレーター）', DEA: 'DEA（データエンジニア アソシエイト）',
  MLA: 'MLA（機械学習エンジニア アソシエイト）', SAP: 'SAP（ソリューションアーキテクト プロフェッショナル）',
  DOP: 'DOP（DevOps エンジニア プロフェッショナル）', AIP: 'AIP（生成AI）',
  ANS: 'ANS（高度なネットワーキング）', SCS: 'SCS（セキュリティ）',
};

export default async function ComparePage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const c = await fetchOne(slug);
  if (!c) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: c.title,
        description: c.intro,
        inLanguage: 'ja',
        about: c.services.map(s => ({ '@type': 'Thing', name: s })),
        author: { '@type': 'Organization', name: '無限ノック' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '無限ノック', item: 'https://mugenknock.com/' },
          { '@type': 'ListItem', position: 2, name: 'サービス比較', item: 'https://mugenknock.com/compare/' },
          { '@type': 'ListItem', position: 3, name: c.title, item: `https://mugenknock.com/compare/${slug}/` },
        ],
      },
    ],
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* パンくず */}
      <nav style={{ marginBottom: 24, fontSize: 14, color: '#666' }}>
        <Link href="/" style={{ color: '#0047A3', textDecoration: 'none' }}>無限ノック</Link>
        {' › '}
        <Link href="/compare/" style={{ color: '#0047A3', textDecoration: 'none' }}>サービス比較</Link>
        {' › '}{c.category}
      </nav>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.4, marginBottom: 16 }}>
        {c.title}
      </h1>

      {/* 概要 */}
      <p style={{ fontSize: 16, lineHeight: 1.9, color: '#333', marginBottom: 32 }}>{c.intro}</p>

      {/* 比較表 */}
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e65100', margin: '0 0 16px' }}>比較表</h2>
      <div style={{ overflowX: 'auto', marginBottom: 40 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #e0e0e0', padding: '10px 12px', background: '#232f3e', color: '#fff', textAlign: 'left', whiteSpace: 'nowrap' }}>観点</th>
              {c.services.map(s => (
                <th key={s} style={{ border: '1px solid #e0e0e0', padding: '10px 12px', background: '#0047A3', color: '#fff', textAlign: 'left' }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.axes.map((row, i) => (
              <tr key={i} style={{ background: i % 2 ? '#f8f9fa' : '#fff' }}>
                <th scope="row" style={{ border: '1px solid #e0e0e0', padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap' }}>{row.axis}</th>
                {c.services.map(s => (
                  <td key={s} style={{ border: '1px solid #e0e0e0', padding: '10px 12px', color: '#333', lineHeight: 1.7, verticalAlign: 'top' }}>
                    {row.values?.[s] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 使い分け */}
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e65100', margin: '0 0 16px' }}>こういう時はどれ？（使い分け）</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {c.useCases.map((u, i) => (
          <div key={i} style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: '16px 20px', background: '#fff' }}>
            <div style={{ fontSize: 15, color: '#1a1a1a', lineHeight: 1.7, marginBottom: 8 }}>{u.scenario}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, padding: '3px 12px', borderRadius: 20, background: '#e8f5e9', color: '#2e7d32' }}>
                → {u.recommend}
              </span>
              <span style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>{u.why}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 試験ポイント */}
      <section style={{ padding: '20px 24px', background: '#fff8e1', borderRadius: 12, borderLeft: '4px solid #ff9900', marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e65100', marginBottom: 12 }}>AWS認定試験でのポイント</h2>
        <p style={{ margin: 0, lineHeight: 1.9, fontSize: 15, color: '#333', whiteSpace: 'pre-wrap' }}>{c.examPoints}</p>
      </section>

      {/* 内部リンク：関連演習 */}
      {c.examTypes && c.examTypes.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>関連する練習問題で理解を定着</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.examTypes.map(et => (
              <Link key={et} href={`/questions/${et}/`} style={{ fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 20, border: '1px solid #0047A3', color: '#0047A3', textDecoration: 'none' }}>
                {EXAM_LABEL[et] ?? et} の問題 →
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div style={{ padding: 28, background: 'linear-gradient(135deg, #232f3e 0%, #0047A3 100%)', borderRadius: 16, textAlign: 'center', color: '#fff', marginBottom: 40 }}>
        <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>違いを理解したら、問題を解いて定着させよう</p>
        <p style={{ opacity: 0.85, marginBottom: 20, fontSize: 14 }}>無限ノックはAWS認定試験の無料練習問題サービス。全問オリジナル・解説つき。</p>
        <Link href="/" style={{ display: 'inline-block', padding: '12px 32px', background: '#ff9900', color: '#fff', borderRadius: 28, textDecoration: 'none', fontWeight: 800, fontSize: 16 }}>
          無料で演習を始める →
        </Link>
      </div>

      {/* 公式ドキュメント */}
      {c.docUrls && c.docUrls.length > 0 && (
        <div style={{ marginBottom: 24, fontSize: 13, color: '#666' }}>
          参考（AWS公式）:{' '}
          {c.docUrls.map((u, i) => (
            <span key={u}>
              {i > 0 && ' / '}
              <a href={u} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#0047A3' }}>{c.services[i] ?? u}</a>
            </span>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        <Link href="/compare/" style={{ color: '#0047A3', textDecoration: 'none', fontSize: 14 }}>← サービス比較の一覧に戻る</Link>
      </div>
    </div>
  );
}
