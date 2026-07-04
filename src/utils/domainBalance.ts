// Lambda 側 domainBalancedOrder（app.js）のクライアント版。
// ドメインごとにバケット化し、「既回答数 + 本選定での選出数」が最小のドメインから
// 1問ずつ拾う deficit round-robin。回答が少ないドメインほど優先され、出題が特定
// ドメインに偏らない。answeredPerDomain を空にすれば全ドメイン均等の round-robin。
//
// idsOnly（backend）を通らない出題フロー（Home サクッと演習のフォールバック・模試）で
// クライアント側プールを並べ替えるために使う。純粋シャッフルの置き換え。

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function domainBalancedOrder<T>(
  items: T[],
  getDomain: (item: T) => number,
  answeredPerDomain: Record<number, number> = {},
): T[] {
  const buckets = new Map<number, T[]>();
  for (const q of items) {
    const d = getDomain(q);
    const key = d == null ? -1 : d;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(q);
  }
  // 各ドメイン内はランダム化（同一ドメイン内の順序に偏りを残さない）
  for (const arr of buckets.values()) shuffleInPlace(arr);
  const running: Record<number, number> = {};
  for (const d of buckets.keys()) running[d] = answeredPerDomain[d] || 0;
  const result: T[] = [];
  while (result.length < items.length) {
    let bestD: number | null = null;
    let best = Infinity;
    for (const [d, arr] of buckets) {
      if (arr.length === 0) continue;
      if (running[d] < best) { best = running[d]; bestD = d; }
    }
    if (bestD === null) break;
    result.push(buckets.get(bestD)!.shift()!);
    running[bestD] += 1;
  }
  return result;
}
