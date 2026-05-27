/** ロード進捗を limit に向けて漸近的にアニメーション。返り値はキャンセル関数。 */
export function animateLoadPct(setFn: (v: number) => void, from: number, limit: number, intervalMs = 120): () => void {
  let current = from;
  const id = setInterval(() => {
    current = current + (limit - current) * 0.07;
    setFn(Math.round(current));
    if (limit - current < 0.4) clearInterval(id);
  }, intervalMs);
  return () => clearInterval(id);
}

/** 60〜80 のランダムな中間停止点を返す */
export function randomPlateau(): number {
  return Math.floor(Math.random() * 21) + 60;
}
