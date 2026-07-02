import { API_ENDPOINT } from '../constants';

// 日次演習カウントのサーバ集計。
// セッション終了ごとに incrementDailyProgress でサーバへ加算し（アトミック加算）、
// 表示側は fetchDailyProgress で当日の合算値を取得する。
// 複数デバイスで同じ日に演習しても正しく合算される（localStorage の同期は不要）。
// ゲスト（'guest'）は対象外＝従来どおりローカルのみ。

export const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export const dailyCountKey = (examType: string, uid: string) =>
  `dailyQCount_${examType}_${uid}_${jstToday()}`;

/** サーバの当日カウントに n を加算し、加算後の合計を返す（ゲスト・失敗時は null） */
export async function incrementDailyProgress(userId: string, examType: string, n: number): Promise<number | null> {
  if (!userId || userId === 'guest' || n <= 0) return null;
  try {
    const res = await fetch(`${API_ENDPOINT}/users/me/daily-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, examType, count: n }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const total = typeof data.count === 'number' ? data.count : null;
    // 既存の読み取り箇所（ホームの進捗表示等）が localStorage を参照するためミラーする
    if (total != null) {
      try { localStorage.setItem(dailyCountKey(examType, userId), String(total)); } catch {}
    }
    return total;
  } catch {
    return null;
  }
}

/** サーバの当日カウントを取得し localStorage にミラーして返す（ゲスト・失敗時は null） */
export async function fetchDailyProgress(userId: string, examType: string): Promise<number | null> {
  if (!userId || userId === 'guest') return null;
  try {
    const res = await fetch(`${API_ENDPOINT}/users/me/daily-progress?userId=${encodeURIComponent(userId)}&examType=${encodeURIComponent(examType)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const total = typeof data.count === 'number' ? data.count : null;
    if (total != null) {
      try {
        const key = dailyCountKey(examType, userId);
        // ローカルの方が大きい場合は「送信前に落ちた加算」の可能性があるため上書きしない
        const local = parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
        if (total >= local) localStorage.setItem(key, String(total));
      } catch {}
    }
    return total;
  } catch {
    return null;
  }
}
