'use client';
import React from 'react';

// キーキャップ内のグリフ。Enter(⏎)はフォントのグリフが細く見づらいため、
// 太さ(strokeWidth)を指定できるSVG（コーナーダウンレフト矢印）で描画する。
function KeyGlyph({ k }: { k: string }) {
  if (k === '⏎') {
    return (
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" style={{ display: 'block' }}
      >
        <polyline points="9 10 4 15 9 20" />
        <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      </svg>
    );
  }
  return <>{k}</>;
}

// キーボード操作ヒント。各キーを個別のキーキャップ（四角・グリフ中央寄せ）で表示する。
// 既定は Ctrl + Enter（Ctrl / ⏎）。色は currentColor を継承するためボタン内でそのまま使える。
export default function KeyHint({ keys = ['Ctrl', '⏎'] }: { keys?: string[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
      {keys.map((k, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 20, height: 20, padding: '0 3px', boxSizing: 'border-box',
            border: '1px solid currentColor', borderRadius: 4,
            fontSize: 'var(--font-size-sm)', fontWeight: 700, lineHeight: 1, opacity: 0.9,
          }}
        >
          <KeyGlyph k={k} />
        </span>
      ))}
    </span>
  );
}
