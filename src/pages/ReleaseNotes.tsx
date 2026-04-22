import React, { useEffect, useState } from 'react';
import { API_ENDPOINT } from '../constants';

type Release = {
  releaseId: string;
  date: string;
  title: string;
  body: string;
};

const SHOW_DEFAULT = 5;

export default function ReleaseNotes() {
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
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px', color: '#16191f' }} className="page-container">
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 32px' }}>リリースノート</h1>

      {loading && <p style={{ color: '#545b64', fontSize: 14 }}>読み込み中...</p>}

      {!loading && releases.length === 0 && (
        <p style={{ color: '#545b64', fontSize: 14 }}>まだ情報はありません。</p>
      )}

      {visible.map((r, i) => (
        <div key={r.releaseId}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: '#879596', fontWeight: 700, marginBottom: 5 }}>{r.date}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#16191f', marginBottom: 8 }}>{r.title}</div>
            <div style={{ fontSize: 14, color: '#545b64', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{r.body}</div>
          </div>
          {i < visible.length - 1 && (
            <div style={{ height: 1, background: '#eaeded', marginBottom: 24 }} />
          )}
        </div>
      ))}

      {!showAll && hiddenCount > 0 && (
        <div style={{ borderTop: '1px solid #eaeded', paddingTop: 24, marginTop: 8 }}>
          <button
            onClick={() => setShowAll(true)}
            style={{
              padding: '8px 24px', background: 'white', color: '#008c8c',
              border: '1px solid #008c8c', borderRadius: 9999,
              cursor: 'pointer', fontSize: 14, fontWeight: 700,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e0f2f2'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
          >
            過去の更新を見る（{hiddenCount}件）
          </button>
        </div>
      )}
    </div>
  );
}
