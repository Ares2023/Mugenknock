// おひねり（100円で1日の演習上限を撤廃）の購入まわり。Stripe と DynamoDB は引数で受け取る（テスト容易化）。specs/006。

const PRICE_YEN = 100;
const PRODUCT_NAME = 'おひねり（1日の演習上限の解除）';

// 決済後の戻り先として許可するオリジン。Origin ヘッダの偽装で外部サイトへ飛ばされないよう許可リストで絞る。
const ALLOWED_ORIGIN_RES = [
  /^https:\/\/mugenknock\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?mugenknock\.pages\.dev$/,
  /^http:\/\/localhost:\d+$/,
];
const DEFAULT_ORIGIN = 'https://mugenknock.com';

function safeOrigin(origin) {
  return typeof origin === 'string' && ALLOWED_ORIGIN_RES.some(re => re.test(origin)) ? origin : DEFAULT_ORIGIN;
}

// Stripe Checkout セッションの作成パラメータ。誰の購入かは client_reference_id（Cognito の sub）で結びつける。
function buildCheckoutParams({ sub, email, origin }) {
  const base = safeOrigin(origin);
  return {
    mode: 'payment',
    client_reference_id: sub,
    ...(email ? { customer_email: email } : {}),
    line_items: [{
      quantity: 1,
      price_data: { currency: 'jpy', unit_amount: PRICE_YEN, product_data: { name: PRODUCT_NAME } },
    }],
    // {CHECKOUT_SESSION_ID} は Stripe が実際のIDに置き換える。戻り先でサーバに確認を依頼するために使う
    success_url: `${base}/aws/ohineri/?ohineri=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/aws/ohineri/?ohineri=cancel`,
  };
}

// 支払い済みの Checkout セッションから購入記録を作る。支払い済みでない・金額が違う・誰の購入か不明なら null。
// 同じ Stripe アカウントで別の商品を売っても、おひねり以外を撤廃に結びつけないよう金額と通貨も確認する。
function purchaseFromSession(session) {
  if (!session || session.payment_status !== 'paid') return null;
  if (session.mode !== 'payment' || session.currency !== 'jpy' || session.amount_total !== PRICE_YEN) return null;
  if (!session.client_reference_id) return null;
  return {
    userId: session.client_reference_id,
    stripeSessionId: session.id,
    amount: session.amount_total,
    purchasedAt: new Date().toISOString(),
  };
}

// 購入を保存する。同じユーザーが既に購入済みなら何も変えない（冪等）。
// 戻り値: { recorded: true } 新規に記録 / { recorded: false } 既に購入済み
async function recordPurchase({ docClient, PutCommand, table, purchase }) {
  try {
    await docClient.send(new PutCommand({
      TableName: table,
      Item: { ...purchase, ohineri: true },
      ConditionExpression: 'attribute_not_exists(userId)',
    }));
    return { recorded: true };
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') return { recorded: false };
    throw e;
  }
}

module.exports = { PRICE_YEN, safeOrigin, buildCheckoutParams, purchaseFromSession, recordPurchase };
