import React, { useEffect, useRef, useState } from 'react';

type RevealVariant = 'fade' | 'pop' | 'left';

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** ステップごとにずらす表示遅延(ms) */
  delay?: number;
  /** 表示開始のしきい値（0〜1） */
  threshold?: number;
  /** 立ち上がりの移動量(px) */
  offset?: number;
  /** アニメーション種別: fade(下から上)・pop(スケール)・left(左から右) */
  variant?: RevealVariant;
  /** IntersectionObserver の rootMargin。負値でトリガーを遅らせる。例: '-10px 0px -80px 0px' */
  rootMargin?: string;
}

/**
 * スクロールでビューポートに入ったら一度だけフェードインする。
 * prefers-reduced-motion や IntersectionObserver 非対応環境では即表示。
 */
const Reveal: React.FC<RevealProps> = ({
  children,
  delay = 0,
  threshold = 0.12,
  offset = 16,
  variant = 'fade',
  rootMargin = '0px 0px 0px 0px',
  style,
  ...rest
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const ob = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            ob.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [threshold]);

  const hiddenTransform =
    variant === 'pop'
      ? 'scale(0.92)'
      : variant === 'left'
        ? `translateX(-${offset}px)`
        : `translateY(${offset}px)`;

  const easing =
    variant === 'pop'
      ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      : 'cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : hiddenTransform,
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ${easing} ${delay}ms`,
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
