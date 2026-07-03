'use client';
import React, { useEffect, useState } from 'react';
import { useNavigate } from '@/compat/react-router-dom';
import { API_ENDPOINT } from '../constants';
import { IconMegaphone, IconClose } from './Icons';

type Announcement = {
  announcementId: string;
  title: string;
};

const DISMISSED_KEY = 'dismissedAnnouncementIds';

function readDismissed(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? '[]'); } catch { return []; }
}

export default function AnnouncementBanner() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/announcements`)
      .then(r => r.json())
      .then(d => {
        const dismissed = readDismissed();
        setAnnouncements((d.items || []).filter((a: Announcement) => !dismissed.includes(a.announcementId)));
      })
      .catch(() => {});
  }, []);

  const dismiss = (id: string) => {
    const dismissed = readDismissed();
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, id]));
    setAnnouncements(prev => prev.filter(a => a.announcementId !== id));
  };

  if (announcements.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-md)' }}>
      {announcements.map(a => (
        <div
          key={a.announcementId}
          onClick={() => navigate('/aws/announcements')}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
            padding: '10px var(--spacing-md)',
            background: 'var(--color-primary-light)',
            borderRadius: 'var(--border-radius-md)',
            cursor: 'pointer',
          }}
        >
          <span style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <IconMegaphone size={16} />
          </span>
          <span style={{ flex: 1, fontSize: 'var(--font-size-sm2)', fontWeight: 700, color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.title}
          </span>
          <button
            onClick={e => { e.stopPropagation(); dismiss(a.announcementId); }}
            aria-label="閉じる"
            style={{
              width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'var(--color-text-sub)',
            }}
          >
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
