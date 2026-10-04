// 出題順の決定ロジック（依存ゼロ＝単体テストできる）。
// docs/06-exercise-logic.md §6.2、specs/003・005 参照。

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ドメインのバケットキー。examType を含めた複合キーにすることで、公式資格と
// companion(オリジナル資格)の問題を混在させたとき（includeCompanion）に、
// 別体系のドメインインデックスが同じ数値というだけで誤って同一バケット扱いに
// なるのを防ぐ。単一examTypeのみの呼び出し（従来の全呼び出し）では常に同じ
// examTypeが入るため、挙動は変わらない安全な一般化。
function domainBucketKey(q) {
  return `${q.examType || ''}:${q.domain == null ? -1 : q.domain}`;
}

// ドメイン均等化: 「ユーザーの既回答数 + 本選定での選出数」が最小のドメインから1問ずつ拾う
// （deficit round-robin）。回答が少ないドメインほど優先され、出題が特定ドメインに偏らない。
// answeredPerDomain: { domainBucketKey: 既回答数 }。ゲスト等で空なら全0＝均等割り。
function domainBalancedOrder(items, answeredPerDomain) {
  const buckets = new Map();
  for (const q of items) {
    const d = domainBucketKey(q);
    if (!buckets.has(d)) buckets.set(d, []);
    buckets.get(d).push(q);
  }
  for (const arr of buckets.values()) shuffle(arr);
  const running = {};
  for (const d of buckets.keys()) running[d] = (answeredPerDomain && answeredPerDomain[d]) || 0;
  const result = [];
  while (result.length < items.length) {
    let bestD = null, best = Infinity;
    for (const [d, arr] of buckets) {
      if (arr.length === 0) continue;
      if (running[d] < best) { best = running[d]; bestD = d; }
    }
    if (bestD === null) break;
    result.push(buckets.get(bestD).shift());
    running[bestD] += 1;
  }
  return result;
}

// 2つの並びを、各側の相対順序を保ったまま、残り件数に比例した確率でランダムにマージする。
//   P(b を取る) = b の残り / (a の残り + b の残り)
// これは「全ての混ぜ方を等確率で選ぶ」ことと等価で、期待される b の割合は件数比と一致し、
// 位置（先頭・末尾）による偏りもない。specs/005。
function interleaveByPool(a, b, rng = Math.random) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const remA = a.length - i, remB = b.length - j;
    if (rng() * (remA + remB) < remB) out.push(b[j++]);
    else out.push(a[i++]);
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

// 公式(targetExam)と前提知識(companion)の問題を、問題数比でランダムに混ぜる。
// 各側の内部は、これまでどおりドメイン均等化（deficit round-robin）を維持する。
// 片側が空（混在なし／階層に片側しかない）なら、従来と同じ単発の domainBalancedOrder。
function companionMixedOrder(items, answeredPerDomain, targetExam, rng = Math.random) {
  if (!targetExam) return domainBalancedOrder(items, answeredPerDomain);
  const targetItems = items.filter(q => q.examType === targetExam);
  const companionItems = items.filter(q => q.examType !== targetExam);
  if (companionItems.length === 0 || targetItems.length === 0) {
    return domainBalancedOrder(items, answeredPerDomain);
  }
  return interleaveByPool(
    domainBalancedOrder(targetItems, answeredPerDomain),
    domainBalancedOrder(companionItems, answeredPerDomain),
    rng,
  );
}

// フィルタ優先（matching を先頭）を保ちつつ、各スコア階層の中を companionMixedOrder で並べる。
// scoreFn が無ければ全体を1回 companionMixedOrder で並べる。
// 基礎知識が混ざらない呼び出し（SAA など）は、従来どおり純粋なドメイン均等化と同じ結果になる。
function selectionOrder(items, answeredPerDomain, scoreFn, targetExam, rng = Math.random) {
  if (!scoreFn) return companionMixedOrder(items, answeredPerDomain, targetExam, rng);
  const tiers = new Map();
  for (const q of items) {
    const s = scoreFn(q);
    if (!tiers.has(s)) tiers.set(s, []);
    tiers.get(s).push(q);
  }
  const out = [];
  for (const s of [...tiers.keys()].sort((a, b) => b - a)) {
    out.push(...companionMixedOrder(tiers.get(s), answeredPerDomain, targetExam, rng));
  }
  return out;
}

module.exports = { shuffle, domainBucketKey, domainBalancedOrder, interleaveByPool, companionMixedOrder, selectionOrder };
