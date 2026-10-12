// Webhook の疎通テスト: app.js を AWS SDK 抜きで起動し、署名付きリクエストが生ボディのまま検証されることを確認する。
// specs/006。実行: node --test lambda/test/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const Module = require('node:module');
const path = require('node:path');

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.ENV = 'dev';

const puts = [];
class Cmd { constructor(input) { this.input = input; } }
const stubs = {
  '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
  '@aws-sdk/client-cognito-identity-provider': { CognitoIdentityProviderClient: class {}, ListUsersCommand: Cmd },
  '@aws-sdk/lib-dynamodb': {
    DynamoDBDocumentClient: { from: () => ({ send: async (cmd) => { if (cmd.constructor.name === 'PutCommand') puts.push(cmd.input); return {}; } }) },
    ScanCommand: Cmd, GetCommand: Cmd, QueryCommand: Cmd, UpdateCommand: Cmd, TransactWriteCommand: Cmd, DeleteCommand: Cmd, BatchGetCommand: Cmd,
    PutCommand: class PutCommand extends Cmd {},
  },
  'aws-jwt-verify': { CognitoJwtVerifier: { create: () => ({ verify: async () => { throw new Error('no'); } }) } },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) { return stubs[request] || origLoad.call(this, request, ...rest); };
const app = require(path.join(__dirname, '../src/app.js'));
Module._load = origLoad;
const Stripe = require('../src/node_modules/stripe');

function post(port, body, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, method: 'POST', path: '/webhooks/stripe', headers: { 'Content-Type': 'application/json', ...headers } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject); req.end(body);
  });
}

const session = { id: 'cs_test_9', payment_status: 'paid', mode: 'payment', currency: 'jpy', amount_total: 100, client_reference_id: 'user-9' };
const payload = JSON.stringify({ id: 'evt_9', object: 'event', type: 'checkout.session.completed', data: { object: session } });
const sign = (p, secret = 'whsec_test_secret') => new Stripe('sk_test_dummy').webhooks.generateTestHeaderString({ payload: p, secret });

test('正しい署名の Webhook は 200 になり、購入が保存される', async () => {
  const server = app.listen(0); const port = server.address().port;
  try {
    puts.length = 0;
    const r = await post(port, payload, { 'stripe-signature': sign(payload) });
    assert.strictEqual(r.status, 200, r.body);
    assert.strictEqual(puts.length, 1);
    assert.strictEqual(puts[0].TableName, 'UserEntitlements-dev');
    assert.strictEqual(puts[0].Item.userId, 'user-9');
  } finally { server.close(); }
});

test('署名が無い・不正・改ざんされた Webhook は 400 で、何も保存されない', async () => {
  const server = app.listen(0); const port = server.address().port;
  try {
    puts.length = 0;
    assert.strictEqual((await post(port, payload, {})).status, 400);
    assert.strictEqual((await post(port, payload, { 'stripe-signature': sign(payload, 'whsec_wrong') })).status, 400);
    assert.strictEqual((await post(port, payload + ' ', { 'stripe-signature': sign(payload) })).status, 400);
    assert.strictEqual(puts.length, 0);
  } finally { server.close(); }
});

test('支払い済みでない決済は 200 だが保存しない', async () => {
  const server = app.listen(0); const port = server.address().port;
  try {
    puts.length = 0;
    const p = JSON.stringify({ id: 'evt_10', object: 'event', type: 'checkout.session.completed', data: { object: { ...session, payment_status: 'unpaid' } } });
    assert.strictEqual((await post(port, p, { 'stripe-signature': sign(p) })).status, 200);
    assert.strictEqual(puts.length, 0);
  } finally { server.close(); }
});
