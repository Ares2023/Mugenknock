import React from 'react';
import Breadcrumb from '../components/Breadcrumb';

type Release = {
  date: string;
  tag?: string;
  items: string[];
};

const RELEASES: Release[] = [
  {
    date: '2026-04-22',
    tag: 'UI',
    items: [
      'ボタンデザインをカプセル型（完全な角丸）に統一',
      'ホームページのブランドバッジを削除、ヘッダーのロゴのみに整理',
    ],
  },
  {
    date: '2026-04-21',
    tag: '機能追加',
    items: [
      '演習設定に「未回答のみ」フィルタを追加（ブックマークフィルタとの併用も可能）',
    ],
  },
  {
    date: '2026-04-20',
    tag: '改善',
    items: [
      'ログインなしで演習・模試・問題一覧・統計を閲覧できるように変更',
    ],
  },
  {
    date: '2026-04-19',
    tag: 'UI',
    items: [
      'サイト名を「AWS Waypoint Sherpa」に変更',
      'ヘッダーロゴのフォントを Open Sans Light に変更し AWS コンソール風に調整',
    ],
  },
];

const TAG_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  '機能追加': { bg: '#e0f2f2', color: '#008c8c', border: '#008c8c' },
  'UI':       { bg: '#f0f0ff', color: '#5a5aaa', border: '#5a5aaa' },
  '改善':     { bg: '#fff8e0', color: '#b85c00', border: '#b85c00' },
  '修正':     { bg: '#fdf3f1', color: '#d13212', border: '#d13212' },
  '問題追加': { bg: '#f2fcf3', color: '#037f0c', border: '#037f0c' },
};

const defaultTag = { bg: '#f2f3f3', color: '#545b64', border: '#d1d5db' };

export default function ReleaseNotes() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px', color: '#16191f' }} className="page-container">
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: 'リリースノート' }]} />
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>リリースノート</h1>
      <p style={{ fontSize: 14, color: '#545b64', margin: '0 0 32px' }}>
        AWS Waypoint Sherpa のアップデート履歴です。
      </p>

      <div style={{ position: 'relative' }}>
        {/* 縦線 */}
        <div style={{
          position: 'absolute', left: 79, top: 0, bottom: 0,
          width: 2, background: '#eaeded', zIndex: 0,
        }} />

        {RELEASES.map((r, i) => {
          const tc = r.tag ? (TAG_COLORS[r.tag] ?? defaultTag) : defaultTag;
          return (
            <div key={i} style={{ display: 'flex', gap: 24, marginBottom: 32, position: 'relative' }}>
              {/* 日付 */}
              <div style={{ width: 72, flexShrink: 0, paddingTop: 2, textAlign: 'right' }}>
                <span style={{ fontSize: 12, color: '#545b64', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {r.date}
                </span>
              </div>

              {/* ドット */}
              <div style={{
                position: 'relative', zIndex: 1, flexShrink: 0,
                width: 12, height: 12, borderRadius: 9999,
                background: r.tag ? tc.color : '#aab7b8',
                border: `2px solid white`,
                boxShadow: `0 0 0 2px ${r.tag ? tc.color : '#aab7b8'}`,
                marginTop: 4,
              }} />

              {/* カード */}
              <div style={{
                flex: 1,
                background: 'white',
                border: '1px solid #eaeded',
                borderRadius: 6,
                padding: '14px 20px',
                boxShadow: '0 1px 1px 0 rgba(0,28,36,0.07)',
              }}>
                {r.tag && (
                  <span style={{
                    display: 'inline-block', fontSize: 11, fontWeight: 700,
                    padding: '1px 8px', borderRadius: 9999,
                    background: tc.bg, color: tc.color,
                    border: `1px solid ${tc.border}`,
                    marginBottom: 8,
                  }}>
                    {r.tag}
                  </span>
                )}
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {r.items.map((item, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, lineHeight: 1.6, marginBottom: j < r.items.length - 1 ? 6 : 0 }}>
                      <span style={{ color: '#008c8c', flexShrink: 0, marginTop: 2 }}>•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
