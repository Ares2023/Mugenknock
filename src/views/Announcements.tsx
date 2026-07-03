'use client';
import React, { useEffect, useState } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { API_ENDPOINT } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import PageLayout from '../components/ui/PageLayout';
import { IconChevronDown, IconChevronUp } from '../components/Icons';

type Announcement = {
  announcementId: string;
  title: string;
  body: string;
  publishedAt: string;
};

const LS_KEY = 'readAnnouncementIds';
function lsReadIds(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; }
}

export default function Announcements() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      const [itemsRes, statusRes] = await Promise.allSettled([
        fetch(`${API_ENDPOINT}/announcements`).then(r => r.json()),
        user
          ? fetch(`${API_ENDPOINT}/announcements/read-status?userId=${encodeURIComponent(user.userId)}`).then(r => r.json())
          : Promise.resolve(null),
      ]);
      if (itemsRes.status === 'fulfilled') setAnnouncements(itemsRes.value?.items ?? []);
      if (statusRes.status === 'fulfilled' && statusRes.value) {
        setReadIds(statusRes.value.readIds ?? []);
      } else {
        setReadIds(lsReadIds());
      }
      setLoading(false);
    };
    fetchAll().catch(() => setLoading(false));
  }, [user?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = (id: string) => {
    if (readIds.includes(id)) return;
    const next = [...readIds, id];
    setReadIds(next);
    if (user) {
      fetch(`${API_ENDPOINT}/announcements/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, ids: [id] }),
      }).catch(() => {});
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    }
  };

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

      {announcements.map((a, i) => {
        const expanded = expandedId === a.announcementId;
        const unread = !readIds.includes(a.announcementId);
        return (
          <div key={a.announcementId}>
            <button
              onClick={() => {
                setExpandedId(expanded ? null : a.announcementId);
                markRead(a.announcementId);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', width: '100%',
                padding: 'var(--spacing-sm) 0', background: 'none', border: 'none', cursor: 'pointer',
                textAlign: 'left', color: 'inherit', font: 'inherit',
              }}
            >
              {unread && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-danger)', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontWeight: 700, flexShrink: 0, minWidth: 76 }}>
                {a.publishedAt?.slice(0, 10)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-base)', fontWeight: unread ? 700 : 400, color: 'var(--color-text-main)', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                {a.title}
              </span>
              <span style={{ color: 'var(--color-text-light)', flexShrink: 0, display: 'flex' }}>
                {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </span>
            </button>
            {expanded && (
              <div style={{
                fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', lineHeight: 1.8, whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word', wordBreak: 'break-word', padding: '0 0 var(--spacing-md)',
              }}>
                {a.body}
              </div>
            )}
            {i < announcements.length - 1 && (
              <div style={{ height: 1, background: 'color-mix(in srgb, var(--color-text-light) 40%, transparent)' }} />
            )}
          </div>
        );
      })}
    </PageLayout>
  );
}
