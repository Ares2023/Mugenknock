import { API_ENDPOINT } from '../constants';

const KEY = (uid: string) => `userPoints_${uid}`;

export function getPoints(uid: string): number {
  return parseInt(localStorage.getItem(KEY(uid)) ?? '0', 10) || 0;
}

function dispatch(next: number) {
  window.dispatchEvent(new CustomEvent('pointsChanged', { detail: next }));
}

function syncToServer(uid: string, points: number): void {
  fetch(`${API_ENDPOINT}/users/me/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: uid, points }),
  }).catch(() => {});
}

export async function fetchPointsFromServer(uid: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_ENDPOINT}/users/me/points?userId=${encodeURIComponent(uid)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.points === 'number' ? data.points : null;
  } catch {
    return null;
  }
}

export function addPoints(uid: string, n: number): number {
  const next = getPoints(uid) + n;
  localStorage.setItem(KEY(uid), String(next));
  dispatch(next);
  syncToServer(uid, next);
  return next;
}

export function deductPoints(uid: string, n: number): boolean {
  const current = getPoints(uid);
  if (current < n) return false;
  const next = current - n;
  localStorage.setItem(KEY(uid), String(next));
  dispatch(next);
  syncToServer(uid, next);
  return true;
}
