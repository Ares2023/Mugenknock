'use client';
import React from 'react';

// キーボード操作ヒント。各キーを個別のキーキャップ（四角・グリフ中央寄せ）で表示する。
// 既定は Shift + Enter（⇧ / ⏎）。色は currentColor を継承するためボタン内でそのまま使える。
export default function KeyHint({ keys = ['⇧', '⏎'] }: { keys?: string[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
      {keys.map((k, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 20, height: 20, padding: '0 3px', boxSizing: 'border-box',
            border: '1px solid currentColor', borderRadius: 4,
            fontSize: 12, fontWeight: 700, lineHeight: 1, opacity: 0.9,
          }}
        >
          {k}
        </span>
      ))}
    </span>
  );
}
