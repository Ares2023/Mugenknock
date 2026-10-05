// おひねり購入まわりの単体テスト。実行: node --test lambda/test/
const test = require('node:test');
const assert = require('node:assert');
const Stripe = require('../src/node_modules/stripe');
const { PRICE_YEN, safeOrigin, buildCheckoutParams, purchaseFromSession, recordPurchase } = require('../src/ohineri');

const paid = (over = {}) => ({ id: 'cs_test_1', payment_status: 'paid', mode: 'payment', currency: 'jpy', amount_total: 100, client_reference_id: 'user-sub-1', ...over });

test('戻り先は許可リストのオリジンだけ。それ以外は本番にフォールバック', () => {
  assert.strictEqual(safeOrigin('https://mugenknock.com'), 'https://mugenknock.com');
  assert.strictEqual(safeOrigin('https://38375e35.mugenknock.pages.dev'), 'https://38375e35.mugenknock.pages.dev');
  assert.strictEqual(safeOrigin('http://localhost:3000'), 'http://localhost:3000');
  assert.strictEqual(safeOrigin('https://evil.example.com'), 'https://mugenknock.com');
  assert.strictEqual(safeOrigin('https://mugenknock.com.evil.com'), 'https://mugenknock.com');
  assert.strictEqual(safeOrigin(undefined), 'https://mugenknock.com');
});

test('決済セッションに、誰の購入か(sub)・100円・JPYが入る', () => {
  const p = buildCheckoutParams({ sub: 'abc', email: 'a@example.com', origin: 'https://mugenknock.com' });
  assert.strictEqual(p.client_reference_id, 'abc');
  assert.strictEqual(p.mode, 'payment');
  assert.strictEqual(p.line_items[0].price_data.currency, 'jpy');
  assert.strictEqual(p.line_items[0].price_data.unit_amount, PRICE_YEN);
  assert.ok(p.success_url.includes('{CHECKOUT_SESSION_ID}'));
  assert.ok(p.success_url.startsWith('https://mugenknock.com/aws/ohineri/'));
  assert.ok(p.cancel_url.startsWith('https://mugenknock.com/aws/ohineri/'));
});

test('支払い済み・100円・JPY・sub あり なら購入として扱う', () => {
  const r = purchaseFromSession(paid());
  assert.strictEqual(r.userId, 'user-sub-1');
  assert.strictEqual(r.stripeSessionId, 'cs_test_1');
});

test('未払い・金額違い・通貨違い・sub なしは購入にしない', () => {
  assert.strictEqual(purchaseFromSession(paid({ payment_status: 'unpaid' })), null);
  assert.strictEqual(purchaseFromSession(paid({ amount_total: 500 })), null);
  assert.strictEqual(purchaseFromSession(paid({ currency: 'usd' })), null);
  assert.strictEqual(purchaseFromSession(paid({ client_reference_id: null })), null);
  assert.strictEqual(purchaseFromSession(paid({ mode: 'subscription' })), null);
  assert.strictEqual(purchaseFromSession(null), null);
});

test('購入の保存は冪等: 2回目は記録されない（既存を上書きしない）', async () => {
  const store = new Map();
  const docClient = { send: async (cmd) => {
    const item = cmd.input.Item;
    if (store.has(item.userId)) { const e = new Error('x'); e.name = 'ConditionalCheckFailedException'; throw e; }
    store.set(item.userId, item);
  } };
  class PutCommand { constructor(input) { this.input = input; } }
  const purchase = purchaseFromSession(paid());
  assert.deepStrictEqual(await recordPurchase({ docClient, PutCommand, table: 't', purchase }), { recorded: true });
  assert.deepStrictEqual(await recordPurchase({ docClient, PutCommand, table: 't', purchase: { ...purchase, stripeSessionId: 'cs_test_2' } }), { recorded: false });
  assert.strictEqual(store.get('user-sub-1').stripeSessionId, 'cs_test_1');
});

test('DynamoDB の別のエラーは握りつぶさない', async () => {
  const docClient = { send: async () => { throw new Error('boom'); } };
  class PutCommand { constructor(input) { this.input = input; } }
  await assert.rejects(() => recordPurchase({ docClient, PutCommand, table: 't', purchase: purchaseFromSession(paid()) }), /boom/);
});

test('Webhook の署名検証: 正しい署名は通り、改ざん・別シークレットは拒否される', () => {
  const stripe = new Stripe('sk_test_dummy');
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: paid() } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.strictEqual(stripe.webhooks.constructEvent(Buffer.from(payload), header, secret).type, 'checkout.session.completed');
  assert.throws(() => stripe.webhooks.constructEvent(Buffer.from(payload + ' '), header, secret));
  assert.throws(() => stripe.webhooks.constructEvent(Buffer.from(payload), header, 'whsec_other'));
});
