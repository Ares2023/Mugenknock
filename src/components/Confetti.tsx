'use client';
import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';

// 合格時の紙吹雪。body 直下へ portal して全画面に降らせる
// （pointer-events:none で操作は妨げない）。
const CONFETTI_COLORS = ['#FF9900', '#006CE0', '#037f0c', '#d13212', '#8b5cf6', '#0ea5e9', '#FFD700', '#ff5fa2', '#22c55e'];

export default function Confetti({
  count = 110,
  durationMs = 2500,
  onDone,
}: {
  count?: number;
  durationMs?: number;
  onDone?: () => void;
}) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const spinDir = Math.random() > 0.5 ? 1 : -1;
    return {
      id: i,
      left: Math.random() * 100,                 // vw %
      size: 6 + Math.random() * 8,               // px
      isRect: Math.random() > 0.35,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      delay: Math.random() * 0.6,                // s
      dur: 2.6 + Math.random() * 1.6,            // s（落下時間）
      drift: (Math.random() * 2 - 1) * 80,       // px（横ドリフト）
      rot: (360 + Math.random() * 720) * spinDir, // deg
      startY: -(15 + Math.random() * 35),        // vh（画面外上方の生成位置・ばらつき）
    };
  }), [count]);

  useEffect(() => {
    if (!onDone) return;
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, onDone]);

  const css = useMemo(() => pieces.map(p => `
    @keyframes confettiFall-${p.id} {
      0%   { transform: translateY(${p.startY}vh) translateX(0) rotate(0deg); opacity: 1; }
      85%  { opacity: 1; }
      100% { transform: translateY(112vh) translateX(${p.drift}px) rotate(${p.rot}deg); opacity: 0.85; }
    }`).join('') + `
    @keyframes confettiContainerOut {
      0%   { opacity: 1; }
      60%  { opacity: 1; }
      100% { opacity: 0; }
    }`, [pieces]);

  return createPortal(
    <div aria-hidden style={{
      position: 'fixed', inset: 0, zIndex: 9700, pointerEvents: 'none', overflow: 'hidden',
      // 0〜2秒は不透明、2秒地点からフェード開始し3秒で完全消滅
      animation: `confettiContainerOut ${durationMs}ms linear forwards`,
    }}>
      <style>{css}</style>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: 0, left: `${p.left}vw`,
          width: p.size, height: p.isRect ? p.size * 0.5 : p.size,
          background: p.color,
          borderRadius: p.isRect ? 1 : '50%',
          animation: `confettiFall-${p.id} ${p.dur}s linear ${p.delay}s both`,
        }} />
      ))}
    </div>,
    document.body,
  );
}
