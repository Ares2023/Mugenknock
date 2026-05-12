import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';

// count パラメータは API キーなしでは使用不可 (無料プランは10件まで)
const WHATS_NEW_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://aws.amazon.com/jp/about-aws/whats-new/recent/feed/')}`;
const BLOG_URL      = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://aws.amazon.com/jp/blogs/news/feed/')}`;

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  thumbnail: string;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  } catch { return ''; }
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function IconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', animation: spinning ? 'sherpa-spin 0.8s linear infinite' : 'none' }}
    >
      <path d="M14 8A6 6 0 1 1 8 2.5"/>
      <polyline points="14 2 14 6 10 6"/>
    </svg>
  );
}

// What's New には画像がないのでAWSロゴ代わりの色付きプレースホルダー
function AWSPlaceholder() {
  return (
    <div style={{
      width: 80, height: 60, flexShrink: 0, borderRadius: 6,
      background: 'linear-gradient(135deg, #232f3e 60%, #FF9900 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <svg width="36" height="22" viewBox="0 0 80 50" fill="none">
        <text x="4" y="36" fontSize="28" fontWeight="900" fontFamily="Arial,sans-serif" fill="#FF9900">aws</text>
      </svg>
    </div>
  );
}

function useNewsFeed(url: string) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetch_ = useCallback(async (force = false) => {
    setLoading(true);
    setError(false);
    try {
      const fetchUrl = force ? `${url}&_t=${Date.now()}` : url;
      const res = await fetch(fetchUrl);
      const data = await res.json();
      if (data.status === 'error') throw new Error(data.message);
      const raw: NewsItem[] = (data.items ?? []).map((it: any) => ({
        title: it.title ?? '',
        link: it.link ?? '',
        pubDate: it.pubDate ?? '',
        description: it.description ?? '',
        thumbnail: it.thumbnail ?? '',
      }));
      setItems(raw);
      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { items, loading, error, lastUpdated, refresh: () => fetch_(true) };
}

function NewsList({ items, loading, error, lang, showThumbnail }: {
  items: NewsItem[]; loading: boolean; error: boolean; lang: string; showThumbnail: boolean;
}) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
        <div className="sherpa-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)' }}>
        {lang === 'ja' ? '読み込みに失敗しました' : 'Failed to load'}
      </div>
    );
  }

  return (
    <div>
      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)' }}>
          {lang === 'ja' ? '記事がありません' : 'No articles'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {items.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textDecoration: 'none', color: 'inherit',
              padding: '14px 0',
              borderBottom: i < items.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {showThumbnail && (
                item.thumbnail
                  ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--color-bg-main)' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )
                  : <AWSPlaceholder />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <div style={{
                    fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-primary)',
                    lineHeight: 1.4, flex: 1,
                  }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-light)', flexShrink: 0, marginTop: 2, whiteSpace: 'nowrap' }}>
                    {formatDate(item.pubDate)}
                  </div>
                </div>
                {item.description && (
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.5 }}>
                    {stripHtml(item.description)}{item.description.length > 100 ? '…' : ''}
                  </div>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function AWSNews() {
  const { lang } = useLanguage();
  const ja = lang === 'ja';
  const [tab, setTab] = useState<'whats-new' | 'blog'>('whats-new');

  const whatsNew = useNewsFeed(WHATS_NEW_URL);
  const blog     = useNewsFeed(BLOG_URL);

  const active = tab === 'whats-new' ? whatsNew : blog;
  const showThumbnail = tab === 'blog' || tab === 'whats-new'; // Both show thumbnails (What's New uses placeholder)

  const fmtTime = (d: Date | null) => {
    if (!d) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-xxl)', fontWeight: 700, color: 'var(--color-text-main)' }}>
          {ja ? 'AWSニュース' : 'AWS News'}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {active.lastUpdated && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
              {ja ? `更新: ${fmtTime(active.lastUpdated)}` : `Updated: ${fmtTime(active.lastUpdated)}`}
            </span>
          )}
          <button
            onClick={active.refresh}
            disabled={active.loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 'var(--border-radius-md)',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-white)',
              cursor: active.loading ? 'not-allowed' : 'pointer', fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-sub)', transition: 'all 0.15s',
            }}
          >
            <IconRefresh spinning={active.loading} />
            {ja ? '更新' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--spacing-lg)', borderBottom: '2px solid var(--color-border)' }}>
        {([
          { key: 'whats-new' as const, label: "What's New", count: whatsNew.items.length },
          { key: 'blog'      as const, label: 'AWS Blog',   count: blog.items.length     },
        ]).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 'var(--font-size-base)', fontWeight: tab === key ? 700 : 400,
              color: tab === key ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderBottom: `2px solid ${tab === key ? 'var(--color-primary)' : 'transparent'}`,
              marginBottom: -2, transition: 'all 0.15s',
            }}
          >
            {label}
            {count > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 10,
                background: tab === key ? 'var(--color-primary)' : 'var(--color-bg-main)',
                color: tab === key ? 'white' : 'var(--color-text-light)',
              }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card padding="var(--spacing-lg)">
        <NewsList
          key={tab}
          items={active.items}
          loading={active.loading}
          error={active.error}
          lang={lang}
          showThumbnail={showThumbnail}
        />
      </Card>
    </div>
  );
}
