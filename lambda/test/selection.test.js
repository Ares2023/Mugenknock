// 出題順の単体テスト。実行: node --test lambda/test/
// specs/005-random-companion-mix の受入条件を検証する。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// 検証対象の実装を差し替えられるようにする（旧実装に当てて「テストが現状を検出できる」ことの証明用）
const IMPL = process.env.SELECTION_IMPL || path.join(__dirname, '../src/selection.js');
const { domainBalancedOrder, interleaveByPool, companionMixedOrder, selectionOrder } = require(IMPL);

// MLA の実プール（公式314問・4ドメイン / 基礎知識ML 166問・6ドメイン）に合わせた合成データ
function makePool(targetExam = 'MLA', nTarget = 314, nDomT = 4, companion = 'ML', nComp = 166, nDomC = 6) {
  const items = [];
  for (let i = 0; i < nTarget; i++) items.push({ questionId: `${targetExam.toLowerCase()}-${i}`, examType: targetExam, domain: i % nDomT });
  for (let i = 0; i < nComp; i++) items.push({ questionId: `${companion.toLowerCase()}-${i}`, examType: companion, domain: i % nDomC });
  return items;
}
const isComp = q => q.examType === 'ML';
const share = (list, k) => list.slice(0, k).filter(isComp).length / k;
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = xs => { const m = mean(xs); return mean(xs.map(x => (x - m) ** 2)); };

// 再現性のある乱数（mulberry32）
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const POOL_SHARE = 166 / 480; // 0.3458

test('全問が1回ずつ含まれる（落ちる・重複する問題がない）', () => {
  const items = makePool();
  const out = selectionOrder(items, {}, null, 'MLA');
  assert.strictEqual(out.length, items.length);
  assert.strictEqual(new Set(out.map(q => q.questionId)).size, items.length);
});

test('【統計】先頭10問の基礎知識の割合の平均が、プールの比率に一致する', () => {
  const items = makePool(); const rates = [];
  for (let t = 0; t < 3000; t++) rates.push(share(selectionOrder(items, {}, null, 'MLA'), 10));
  const m = mean(rates);
  assert.ok(Math.abs(m - POOL_SHARE) < 0.015, `平均 ${(m * 100).toFixed(1)}%（期待 ${(POOL_SHARE * 100).toFixed(1)}%±1.5）`);
});

test('【統計】先頭5問・20問でも、プールの比率に一致する（短いセッションで公式が優先されない）', () => {
  const items = makePool();
  for (const k of [5, 20]) {
    const rates = []; for (let t = 0; t < 3000; t++) rates.push(share(selectionOrder(items, {}, null, 'MLA'), k));
    assert.ok(Math.abs(mean(rates) - POOL_SHARE) < 0.02, `先頭${k}問: 平均 ${(mean(rates) * 100).toFixed(1)}%`);
  }
});

test('【統計】試行ごとにばらつく（固定ではない）', () => {
  const items = makePool(); const rates = [];
  for (let t = 0; t < 500; t++) rates.push(share(selectionOrder(items, {}, null, 'MLA'), 10));
  assert.ok(variance(rates) > 0.005, `分散 ${variance(rates).toFixed(4)}（旧実装は0）`);
  assert.ok(new Set(rates).size >= 5, `割合の種類 ${new Set(rates).size}`);
});

test('【統計】AIF（公式5ドメイン）の先頭5問にも基礎知識が出る', () => {
  const items = makePool('AIF', 244, 5, 'ML', 166, 6); const rates = [];
  for (let t = 0; t < 2000; t++) rates.push(share(selectionOrder(items, {}, null, 'AIF'), 5));
  assert.ok(mean(rates) > 0.25, `平均 ${(mean(rates) * 100).toFixed(1)}%（旧実装は0%）`);
});

test('先頭の1問が公式か基礎知識かも、プールの比率でばらつく', () => {
  const items = makePool(); let comp = 0; const N = 4000;
  for (let t = 0; t < N; t++) if (isComp(selectionOrder(items, {}, null, 'MLA')[0])) comp++;
  assert.ok(Math.abs(comp / N - POOL_SHARE) < 0.02, `先頭が基礎知識の確率 ${(comp / N * 100).toFixed(1)}%`);
});

test('各側の内部は、ドメイン均等化の順序を保つ（相対順序が変わらない）', () => {
  const items = makePool();
  const out = selectionOrder(items, {}, null, 'MLA');
  // 公式側だけ取り出した並びで、先頭4問は4ドメインを1問ずつ（deficit round-robin）
  const t = out.filter(q => q.examType === 'MLA').slice(0, 4).map(q => q.domain);
  assert.strictEqual(new Set(t).size, 4, `公式の先頭4問のドメイン: ${t}`);
  const c = out.filter(isComp).slice(0, 6).map(q => q.domain);
  assert.strictEqual(new Set(c).size, 6, `基礎知識の先頭6問のドメイン: ${c}`);
});

test('既回答数が多いドメインは後回し（側の内部の deficit round-robin が効く）', () => {
  const items = makePool();
  const answered = { 'MLA:0': 50, 'MLA:1': 50, 'MLA:2': 50 };  // MLA:3 だけ未回答
  const out = selectionOrder(items, answered, null, 'MLA');
  assert.strictEqual(out.find(q => q.examType === 'MLA').domain, 3);
});

test('interleaveByPool: 各側の相対順序を保ち、全要素を1回ずつ含む', () => {
  const a = Array.from({ length: 30 }, (_, i) => `a${i}`), b = Array.from({ length: 12 }, (_, i) => `b${i}`);
  for (let s = 1; s <= 50; s++) {
    const out = interleaveByPool(a, b, seeded(s));
    assert.strictEqual(out.length, 42);
    assert.deepStrictEqual(out.filter(x => x[0] === 'a'), a);
    assert.deepStrictEqual(out.filter(x => x[0] === 'b'), b);
  }
});

test('interleaveByPool: 片側が空なら、もう片側をそのまま返す', () => {
  assert.deepStrictEqual(interleaveByPool([1, 2, 3], []), [1, 2, 3]);
  assert.deepStrictEqual(interleaveByPool([], [4, 5]), [4, 5]);
  assert.deepStrictEqual(interleaveByPool([], []), []);
});

test('基礎知識が無い資格（SAA）の出題順は従来と同じ＝純粋なドメイン均等化', () => {
  const items = []; for (let i = 0; i < 280; i++) items.push({ questionId: `saa-${i}`, examType: 'SAA', domain: i % 4 });
  const out = selectionOrder(items, {}, null, 'SAA');
  assert.strictEqual(out.length, 280);
  // 先頭4問は4ドメインを1問ずつ
  assert.strictEqual(new Set(out.slice(0, 4).map(q => q.domain)).size, 4);
  assert.strictEqual(new Set(out.map(q => q.questionId)).size, 280);
});

test('【フィルタ】階層の順序は維持され、階層の中で公式と基礎知識が混ざる', () => {
  const items = makePool();
  // 公式の0〜59番・基礎の0〜39番を「不正解」(スコア1)、残りをスコア0にする
  const hit = new Set([...items.filter(q => q.examType === 'MLA').slice(0, 60), ...items.filter(isComp).slice(0, 40)].map(q => q.questionId));
  const scoreFn = q => (hit.has(q.questionId) ? 1 : 0);
  const rates = [];
  for (let t = 0; t < 1500; t++) {
    const out = selectionOrder(items, {}, scoreFn, 'MLA');
    assert.ok(out.slice(0, 100).every(q => hit.has(q.questionId)), '先頭100問は全てスコア1の階層');
    assert.ok(out.slice(100).every(q => !hit.has(q.questionId)), '以降はスコア0の階層');
    rates.push(share(out, 10));
  }
  // スコア1の階層は 公式60 : 基礎40 → 基礎知識 40%
  assert.ok(Math.abs(mean(rates) - 0.4) < 0.025, `階層内の基礎知識の割合 平均 ${(mean(rates) * 100).toFixed(1)}%（期待 40%）`);
});

test('【フィルタ】公式を使い切るまで基礎知識が出ない、という挙動がなくなっている（specs/004の廃止）', () => {
  const items = makePool();
  const hit = new Set(items.filter(q => q.domain % 2 === 0).map(q => q.questionId));
  const scoreFn = q => (hit.has(q.questionId) ? 1 : 0);
  let earlyComp = 0;
  for (let t = 0; t < 300; t++) if (selectionOrder(items, {}, scoreFn, 'MLA').slice(0, 10).some(isComp)) earlyComp++;
  assert.ok(earlyComp > 200, `先頭10問に基礎知識が含まれた試行 ${earlyComp}/300`);
});
