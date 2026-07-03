'use client';
import React, { useEffect, useState } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { API_ENDPOINT } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/ui/Button';
import PageLayout from '../components/ui/PageLayout';

type Announcement = {
  announcementId: string;
  title: string;
  body: string;
  publishedAt: string;
};

const SHOW_DEFAULT = 5;

export default function Announcements() {
  const { t } = useLanguage();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/announcements`)
      .then(r => r.json())
      .then(d => setAnnouncements(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = showAll ? announcements : announcements.slice(0, SHOW_DEFAULT);
  const hiddenCount = announcements.length - SHOW_DEFAULT;

  return (
    <PageLayout className="page-container" style={{ color: 'var(--color-text-main)' }}>
      <Helmet>
        <title>お知らせ | 無限ノック</title>
        <meta name="description" content="無限ノックからのお知らせ。不具合報告や運営からの重要な情報をご確認ください。" />
      </Helmet>
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="sherpa-spinner" />
        </div>
      )}

      {!loading && announcements.length === 0 && (
        <p style={{ color: 'var(--color-text-sub)', fontSize: 'var(--font-size-base)' }}>{t('announcements.empty')}</p>
      )}

      {visible.map((a, i) => (
        <div key={a.announcementId}>
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
              {a.publishedAt?.slice(0, 10)}
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 'var(--spacing-sm)' }}>
              {a.title}
            </div>
            <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {a.body}
            </div>
          </div>
          {i < visible.length - 1 && (
            <div style={{ height: 1, background: 'color-mix(in srgb, var(--color-text-light) 40%, transparent)', marginBottom: 'var(--spacing-lg)' }} />
          )}
        </div>
      ))}

      {!showAll && hiddenCount > 0 && (
        <div style={{ borderTop: '1px solid color-mix(in srgb, var(--color-text-light) 40%, transparent)', paddingTop: 'var(--spacing-lg)', marginTop: 'var(--spacing-sm)' }}>
          <Button variant="outline" data-kbnav="1" onClick={() => setShowAll(true)}>
            {t('announcements.showMore', { n: hiddenCount })}
          </Button>
        </div>
      )}
    </PageLayout>
  );
}
