import { API_ENDPOINT } from '../constants';

type ErrorContext = Record<string, string | number | boolean | null | undefined>;

export function reportError(
  message: string,
  options?: {
    type?: string;
    stack?: string;
    context?: ErrorContext;  // examType, userId, page など
  }
): void {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({
    type: options?.type ?? 'user_operation',
    message,
    stack: options?.stack ?? '',
    context: options?.context ?? {},
    url: window.location.href,
    ua: navigator.userAgent,
    ts: new Date().toISOString(),
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_ENDPOINT}/errors`, payload);
    } else {
      fetch(`${API_ENDPOINT}/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}
}
