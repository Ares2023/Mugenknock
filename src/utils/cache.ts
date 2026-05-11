const DEFAULT_TTL = 5 * 60 * 1000;
const SHORT_TTL = 60 * 1000;

export { SHORT_TTL };

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
