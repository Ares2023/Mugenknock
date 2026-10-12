// 1日の上限の単体テスト。実行: node --test lambda/test/
const test = require('node:test');
const assert = require('node:assert');
const { jstDateKey, countTtlSeconds, isCountedSession, computeLimits, capQuestionCount } = require('../src/entitlements');

test('JSTの日付境界: UTC 14:59 は同日、UTC 15:00 で翌日になる', () => {
  assert.strictEqual(jstDateKey(new Date('2026-10-05T14:59:59Z')), '2026-10-05');
  assert.strictEqual(jstDateKey(new Date('2026-10-05T15:00:00Z')), '2026-10-06');
});

test('JSTの日付境界: 月末・年末をまたぐ', () => {
  assert.strictEqual(jstDateKey(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
  assert.strictEqual(jstDateKey(new Date('2026-01-31T14:59:59Z')), '2026-01-31');
});

test('TTLは今から数日後の epoch 秒', () => {
  const now = new Date('2026-10-05T00:00:00Z');
  const ttl = countTtlSeconds(now);
  assert.ok(ttl > now.getTime() / 1000 + 2 * 86400 && ttl < now.getTime() / 1000 + 4 * 86400);
});

test('模擬試験・ミニ模試は対象外、通常演習は対象', () => {
  assert.strictEqual(isCountedSession({ mode: 'exercise' }), true);
  assert.strictEqual(isCountedSession({ mode: 'exercise', isFocused: true }), true);
  assert.strictEqual(isCountedSession({ mode: 'exam' }), false);
  assert.strictEqual(isCountedSession({ mode: 'exam', isMini: true }), false);
  assert.strictEqual(isCountedSession({ mode: 'exercise', isMini: true }), false);
  assert.strictEqual(isCountedSession(undefined), false);
});

test('無効（公開前）のときは上限が掛からない', () => {
  const l = computeLimits({ enabled: false, used: 999 });
  assert.strictEqual(l.applies, false);
  assert.strictEqual(l.remaining, null);
  assert.strictEqual(capQuestionCount(20, l), 20);
});

test('購入済みは上限が掛からない', () => {
  const l = computeLimits({ enabled: true, unlimited: true, used: 999 });
  assert.strictEqual(l.applies, false);
  assert.strictEqual(l.remaining, null);
  assert.strictEqual(capQuestionCount(20, l), 20);
});

test('無課金: 残り = 30 - 回答数。0未満にならない', () => {
  assert.strictEqual(computeLimits({ enabled: true, used: 0 }).remaining, 30);
  assert.strictEqual(computeLimits({ enabled: true, used: 12 }).remaining, 18);
  assert.strictEqual(computeLimits({ enabled: true, used: 30 }).remaining, 0);
  assert.strictEqual(computeLimits({ enabled: true, used: 45 }).remaining, 0);
});

test('出題数は残りに切り詰める（残りより少なければそのまま）', () => {
  const l = computeLimits({ enabled: true, used: 22 }); // 残り8
  assert.strictEqual(capQuestionCount(20, l), 8);
  assert.strictEqual(capQuestionCount(5, l), 5);
  assert.strictEqual(capQuestionCount(10, computeLimits({ enabled: true, used: 30 })), 0);
});

test('上限値は設定で変えられる', () => {
  assert.strictEqual(computeLimits({ enabled: true, limit: 50, used: 10 }).remaining, 40);
});
