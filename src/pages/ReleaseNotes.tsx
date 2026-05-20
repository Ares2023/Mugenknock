import React, { useEffect, useState } from 'react';
import { API_ENDPOINT } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/ui/Button';

type Release = {
  releaseId: string;
  date: string;
  title: string;
  body: string;
  titleEn?: string;
  bodyEn?: string;
};

const SHOW_DEFAULT = 5;

export default function ReleaseNotes() {
  const { lang, t } = useLanguage();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/releases`)
      .then(r => r.json())
      .then(d => setReleases(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = showAll ? releases : releases.slice(0, SHOW_DEFAULT);
  const hiddenCount = releases.length - SHOW_DEFAULT;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)', color: 'var(--color-text-main)' }} className="page-container">
      <h1 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-xl)' }}>{t('releaseNotes.title')}</h1>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="sherpa-spinner" />
        </div>
      )}

      {!loading && releases.length === 0 && (
        <p style={{ color: 'var(--color-text-sub)', fontSize: 'var(--font-size-base)' }}>{t('releaseNotes.empty')}</p>
      )}

      {visible.map((r, i) => (
        <div key={r.releaseId}>
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>{r.date}</div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 'var(--spacing-sm)' }}>
              {lang === 'en' && r.titleEn ? r.titleEn : r.title}
            </div>
            <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {lang === 'en' && r.bodyEn ? r.bodyEn : r.body}
            </div>
          </div>
          {i < visible.length - 1 && (
            <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 'var(--spacing-lg)' }} />
          )}
        </div>
      ))}

      {!showAll && hiddenCount > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)', marginTop: 'var(--spacing-sm)' }}>
          <Button variant="outline" onClick={() => setShowAll(true)}>
            {t('releaseNotes.showMore', { n: hiddenCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
