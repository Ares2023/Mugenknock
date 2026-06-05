const DEFAULT_TTL = 5 * 60 * 1000;
const SHORT_TTL = 60 * 1000;
const LONG_TTL = 4 * 60 * 60 * 1000; // 4時間（問題リスト永続キャッシュ用）

export { SHORT_TTL, DEFAULT_TTL, LONG_TTL };

export function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`_sc_${key}`);
    if (!raw) return null;
    const { v, exp } = JSON.parse(raw);
    if (Date.now() > exp) { sessionStorage.removeItem(`_sc_${key}`); return null; }
    return v as T;
  } catch { return null; }
}

export function setCached<T>(key: string, value: T, ttl = DEFAULT_TTL): void {
  try {
    sessionStorage.setItem(`_sc_${key}`, JSON.stringify({ v: value, exp: Date.now() + ttl }));
  } catch {}
}

export function deleteCached(key: string): void {
  try { sessionStorage.removeItem(`_sc_${key}`); } catch {}
}

// localStorage 永続キャッシュ（ページ/タブ跨ぎで有効・TTL 付き）
export function getCachedPersist<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`_lsc_${key}`);
    if (!raw) return null;
    const { v, exp } = JSON.parse(raw);
    if (Date.now() > exp) { localStorage.removeItem(`_lsc_${key}`); return null; }
    return v as T;
  } catch { return null; }
}

export function setCachedPersist<T>(key: string, value: T, ttl = LONG_TTL): void {
  try {
    localStorage.setItem(`_lsc_${key}`, JSON.stringify({ v: value, exp: Date.now() + ttl }));
  } catch {}
}

export function deleteCachedPersist(key: string): void {
  try { localStorage.removeItem(`_lsc_${key}`); } catch {}
}
