// 1日の演習上限と「おひねり」購入による撤廃の判定（依存ゼロ＝単体テストできる）。specs/006。

const DEFAULT_DAILY_LIMIT = 30;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const COUNT_TTL_DAYS = 3;

// 日本時間（JST）の日付キー 'YYYY-MM-DD'。0:00（JST）で切り替わる。
function jstDateKey(now = new Date()) {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// 日次カウントの TTL（DynamoDB の epoch 秒）。累積を溜めないため数日で消す。
function countTtlSeconds(now = new Date()) {
  return Math.floor(now.getTime() / 1000) + COUNT_TTL_DAYS * 24 * 60 * 60;
}

// 上限の対象になるセッションか。模擬試験・ミニ模試は対象外（1回が65問あり30問上限と両立しない）。
function isCountedSession(session) {
  if (!session) return false;
  return session.mode !== 'exam' && !session.isMini;
}

// enabled: 管理設定で有効か / unlimited: 購入済みか / used: 今日の回答数
function computeLimits({ enabled, limit = DEFAULT_DAILY_LIMIT, used = 0, unlimited = false }) {
  const applies = !!enabled && !unlimited;
  return {
    enabled: !!enabled,
    unlimited: !!unlimited,
    applies,
    limit,
    used,
    remaining: applies ? Math.max(0, limit - used) : null,
  };
}

// 開始する演習の問題数を、残り問題数に切り詰める。上限が掛からないときはそのまま。
function capQuestionCount(count, limits) {
  if (!limits || !limits.applies) return count;
  return Math.max(0, Math.min(count, limits.remaining));
}

module.exports = { DEFAULT_DAILY_LIMIT, jstDateKey, countTtlSeconds, isCountedSession, computeLimits, capQuestionCount };
