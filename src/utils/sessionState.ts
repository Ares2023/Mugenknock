export function setSessionState<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function getSessionState<T>(key: string): T | null {
  try {
    const item = sessionStorage.getItem(key);
    if (!item) return null;
    sessionStorage.removeItem(key);
    return JSON.parse(item) as T;
  } catch {
    return null;
  }
}
