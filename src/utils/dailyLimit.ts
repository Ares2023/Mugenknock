// 1日の演習上限と「おひねり」購入のクライアント側。判定の本体はサーバ（specs/006）。
// 取得に失敗したときは上限なし扱い（演習を止めない）。ゲストは呼ばない。
const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || '';

export interface Limits {
  enabled: boolean;
  unlimited: boolean;
  applies: boolean;
  limit: number;
  used: number;
  remaining: number | null;
  purchaseEnabled: boolean;
  priceYen: number;
}

export async function fetchLimits(): Promise<Limits | null> {
  try {
    const r = await fetch(`${API_ENDPOINT}/users/me/limits`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Stripe の決済ページの URL を作る。失敗は null。
export async function createCheckoutUrl(): Promise<string | null> {
  try {
    const r = await fetch(`${API_ENDPOINT}/users/me/checkout`, { method: 'POST' });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.url === 'string' ? d.url : null;
  } catch { return null; }
}

// 決済ページから戻った直後に、サーバへ支払いの確認を依頼する。
export async function confirmCheckout(sessionId: string): Promise<Limits | null> {
  try {
    const r = await fetch(`${API_ENDPOINT}/users/me/checkout/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
