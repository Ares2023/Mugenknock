import React, { useEffect, useRef, useState } from 'react';

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** ステップごとにずらす表示遅延(ms)。カード群のスタッガーに使う */
  delay?: number;
  /** 表示開始のしきい値（0〜1） */
  threshold?: number;
  /** 立ち上がりの移動量(px) */
  offset?: number;
}

/**
 * スクロールでビューポートに入ったら一度だけフェードイン（＋わずかに下から上へ）する。
 * prefers-reduced-motion や IntersectionObserver 非対応環境では即表示。
 */
const Reveal: React.FC<RevealProps> = ({ children, delay = 0, threshold = 0.12, offset = 16, style, ...rest }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const ob = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setShown(true); ob.disconnect(); break; }
      }
    }, { threshold });
    ob.observe(el);
    return () => ob.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${offset}px)`,
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        willChange: shown ? undefined : 'opacity, transform',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

export default Reveal;
