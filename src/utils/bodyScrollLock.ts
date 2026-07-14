// オーバーレイ表示中のスクロール・横スワイプを禁止するユーティリティ。
// 複数オーバーレイが重なっても安全なよう参照カウンタで管理する。

let lockCount = 0;
let swipeCount = 0;
let startX = 0;
let startY = 0;

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  const dx = Math.abs(e.touches[0].clientX - startX);
  const dy = Math.abs(e.touches[0].clientY - startY);
  // 横方向が主体のスワイプ（ブラウザバックなど）を禁止
  if (dx > dy) e.preventDefault();
}

// overflow:hidden + 横スワイプ禁止（通常のオーバーレイ用）
export function lockBodyScroll(): () => void {
  if (lockCount === 0) {
    document.body.style.overflow = 'hidden';
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  lockCount++;
  return () => {
    lockCount--;
    if (lockCount === 0) {
      document.body.style.overflow = '';
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    }
  };
}

// 横スワイプ禁止のみ（position:fixed で独自スクロール制御するオーバーレイ用）
export function lockSwipe(): () => void {
  if (swipeCount === 0) {
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  swipeCount++;
  return () => {
    swipeCount--;
    if (swipeCount === 0) {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    }
  };
}
