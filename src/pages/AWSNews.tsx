import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';

const WHATS_NEW_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://aws.amazon.com/jp/about-aws/whats-new/recent/feed/')}&count=50`;
const BLOG_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://aws.amazon.com/jp/blogs/news/feed/')}&count=50`;

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  categories: string[];
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  } catch { return ''; }
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
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

function useNewsFeed(url: string) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetch_ = useCallback(async (force = false) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(url + (force ? `&_t=${Date.now()}` : ''));
      const data = await res.json();
      const raw: NewsItem[] = (data.items ?? []).map((it: any) => ({
        title: it.title ?? '',
        link: it.link ?? '',
        pubDate: it.pubDate ?? '',
        description: it.description ?? '',
        categories: Array.isArray(it.categories) ? it.categories.filter(Boolean) : [],
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

function NewsList({ items, loading, error, lang }: { items: NewsItem[]; loading: boolean; error: boolean; lang: string }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = Array.from(
    new Set(items.flatMap(it => it.categories))
  ).sort();

  const filtered = selectedCategory
    ? items.filter(it => it.categories.includes(selectedCategory))
    : items;

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
      {categories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          <button
            onClick={() => setSelectedCategory(null)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 'var(--font-size-xs)', fontWeight: selectedCategory === null ? 700 : 400,
              border: '1px solid var(--color-border)',
              background: selectedCategory === null ? 'var(--color-primary)' : 'var(--color-bg-white)',
              color: selectedCategory === null ? 'white' : 'var(--color-text-sub)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {lang === 'ja' ? 'すべて' : 'All'}
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 'var(--font-size-xs)', fontWeight: selectedCategory === cat ? 700 : 400,
                border: '1px solid var(--color-border)',
                background: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-bg-white)',
                color: selectedCategory === cat ? 'white' : 'var(--color-text-sub)',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)' }}>
          {lang === 'ja' ? '記事がありません' : 'No articles'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {filtered.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textDecoration: 'none', color: 'inherit',
              padding: '14px 0',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-primary)',
                  lineHeight: 1.4, marginBottom: 4,
                }}>
                  {item.title}
                </div>
                {item.description && (
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.5, marginBottom: 6 }}>
                    {stripHtml(item.description)}{item.description.length > 120 ? '…' : ''}
                  </div>
                )}
                {item.categories.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {item.categories.map(cat => (
                      <span
                        key={cat}
                        style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 10,
                          background: 'var(--color-bg-main)', border: '1px solid var(--color-border)',
                          color: 'var(--color-text-light)',
                        }}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-light)', flexShrink: 0, marginTop: 2, whiteSpace: 'nowrap' }}>
                {formatDate(item.pubDate)}
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
  const blog = useNewsFeed(BLOG_URL);

  const active = tab === 'whats-new' ? whatsNew : blog;

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
          { key: 'whats-new', label: ja ? 'What\'s New' : 'What\'s New', count: whatsNew.items.length },
          { key: 'blog', label: 'AWS Blog', count: blog.items.length },
        ] as const).map(({ key, label, count }) => (
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
        />
      </Card>
    </div>
  );
}
