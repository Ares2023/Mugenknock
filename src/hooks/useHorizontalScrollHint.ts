import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 横スクロール可能な行に「まだ右に続く」ことを示すフェードを付ける。
 *
 * モバイルのブラウザはスクロールバーをオーバーレイ表示（スクロール中のみ可視）にするため、
 * 幅に収まらないタブ行があっても「横に続いている」ことに気づけない。
 * 実際 AIB 追加でレベルタブが6個になった際、390px 幅で末尾2つ
 * （Specialty / オリジナル）が初期表示から外れ、到達手段が無い状態になっていた。
 *
 * 使い方:
 *   const hint = useHorizontalScrollHint(isMobile);
 *   <div ref={hint.ref} style={{ overflowX: 'auto', ...hint.maskStyle }}>…</div>
 *
 * enabled=false（デスクトップ等）では何もしない。
 */
export function useHorizontalScrollHint(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el || !enabled) { setHasMore(false); return; }
    // 右端まで到達していたらフェードを消す（消し忘れると常時出っぱなしで不自然）
    setHasMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, [enabled]);

  useEffect(() => {
    // フォント確定前だと幅が確定しないため次フレームでも測り直す
    update();
    const raf = requestAnimationFrame(update);
    const el = ref.current;
    el?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const fade = 'linear-gradient(to right, #000 calc(100% - 28px), transparent)';
  const maskStyle = hasMore ? { WebkitMaskImage: fade, maskImage: fade } : {};

  return { ref, maskStyle, update };
}
