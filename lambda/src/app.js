const express = require('express');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, QueryCommand, PutCommand, UpdateCommand, TransactWriteCommand, DeleteCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { v4: uuidv4 } = require('uuid');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { ADMIN_EMAIL, EXAM_DOMAINS } = require('./constants');

// ── domain フィールドのユーティリティ ──────────────────────────
// domain は整数インデックス（EXAM_DOMAINS[examType][domain]）
// 旧データ: tags 配列、または domain が文字列の場合があるため両対応
function qDomainName(q) {
  if (typeof q.domain === 'number') return (EXAM_DOMAINS[q.examType] || [])[q.domain] ?? '';
  return '';
}
function qDomainIndex(examType, nameOrIndex) {
  if (typeof nameOrIndex === 'number') return nameOrIndex;
  return (EXAM_DOMAINS[examType] || []).indexOf(nameOrIndex);
}

const app = express();
app.use(express.json({ limit: '2mb' }));

const getClient = () => {
  const client = new DynamoDBClient({ region: 'ap-northeast-1' });
  return DynamoDBDocumentClient.from(client);
};

// ── 問題データ正規化 ──────────────────────────────────────────────
// choices と correctAnswers からラベル接頭辞（"A. " 等）を除去する。
// correctAnswerIndices は DB の値をそのまま使う（全問設定済み）。
const CHOICE_LABEL_RE = /^[A-E][.\s]\s*/i;
function normalizeQuestion(q) {
  const choices = (q.choices || []).map(c => String(c).replace(CHOICE_LABEL_RE, '').trim());
  const correctAnswers = (q.correctAnswers || []).map(c => String(c).replace(CHOICE_LABEL_RE, '').trim());
  const correctAnswerIndices = Array.isArray(q.correctAnswerIndices) ? q.correctAnswerIndices : [];
  return { ...q, choices, correctAnswers, correctAnswerIndices };
}

// ── DailyServices モジュールレベルキャッシュ ────────────────────────
// Lambda ウォームインスタンス間で共有されるキャッシュ（最大 5 分）
let _dailyServicesCache = null;
let _dailyServicesCachedAt = 0;
const DAILY_SERVICES_TTL = 5 * 60 * 1000;

async function getDailyServicesAll(docClient) {
  if (_dailyServicesCache && Date.now() - _dailyServicesCachedAt < DAILY_SERVICES_TTL) {
    return _dailyServicesCache;
  }
  const result = await docClient.send(new ScanCommand({ TableName: 'DailyServices' }));
  _dailyServicesCache = result.Items || [];
  _dailyServicesCachedAt = Date.now();
  return _dailyServicesCache;
}

// ── 試験種別ごとの全問キャッシュ（Lambda ウォームインスタンス内メモリ・10分TTL） ──
// 同一インスタンスへの 2 回目以降のリクエストは DynamoDB を読まずに返す。
// Phase1（metaOnly）→ Phase2（ids+withAnswers）が同インスタンスに当たれば Phase2 も高速化される。
const _examQuestionsCache = new Map(); // examType → { items, cachedAt }
const EXAM_QUESTIONS_CACHE_TTL = 10 * 60 * 1000;

// AIP は DynamoDB 上は GAI として保存されているためエイリアス解決
const EXAM_TYPE_DB_ALIASES = { AIP: 'GAI' };
function resolveExamTypeForDB(et) { return EXAM_TYPE_DB_ALIASES[et] || et; }

async function getAllQuestionsForExam(docClient, examType) {
  const dbType = resolveExamTypeForDB(examType);
  const cacheKey = dbType;
  const cached = _examQuestionsCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < EXAM_QUESTIONS_CACHE_TTL) {
    return cached.items;
  }
  const items = await queryAll(docClient, {
    TableName: 'Questions',
    IndexName: 'examType-index',
    KeyConditionExpression: 'examType = :examType',
    ExpressionAttributeValues: { ':examType': dbType }
  });
  _examQuestionsCache.set(cacheKey, { items, cachedAt: Date.now() });
  return items;
}

// ── CORS（localhost + Cloudflare Pages + 本番ドメイン許可） ──
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://www.mugenknock.com',
  'https://mugenknock.com',
  'https://mugenknock.pages.dev',
];
// Cloudflare Pages のプレビューデプロイ（*.mugenknock.pages.dev 等）も許可
const CF_PAGES_ORIGIN_RE = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*\.pages\.dev$|^https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*\.mugenknock\.pages\.dev$/;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || CF_PAGES_ORIGIN_RE.test(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── 管理者JWT認証ミドルウェア ──
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: 'ap-northeast-1_KIOFciGhQ',
  tokenUse: 'id',
  clientId: '16jjrj5m28o6s2k84og8kh2vh3',
});

async function getAdminEmails() {
  try {
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({ TableName: 'AppSettings', Key: { settingId: 'admins' } }));
    if (!result.Item) return [];
    return JSON.parse(result.Item.emails || '[]');
  } catch {
    return [];
  }
}

async function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = await jwtVerifier.verify(auth.slice(7));
    const email = payload.email;
    if (email !== ADMIN_EMAIL) {
      const extraAdmins = await getAdminEmails();
      if (!extraAdmins.includes(email)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// /admin/* へのすべてのリクエストに管理者認証を適用
app.use('/admin', requireAdmin);

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function scanAll(docClient, params) {
  const items = [];
  let lastKey;
  do {
    const result = await docClient.send(new ScanCommand({ ...params, ...(lastKey ? { ExclusiveStartKey: lastKey } : {}) }));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function queryAll(docClient, params) {
  const items = [];
  let lastKey;
  do {
    const result = await docClient.send(new QueryCommand({ ...params, ...(lastKey ? { ExclusiveStartKey: lastKey } : {}) }));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ヘルスチェック
// 問題生成・チェック状況（日次/月次集計）
app.get('/questions/growth-stats', async (req, res) => {
  try {
    const docClient = getClient();
    const allItems = await scanAll(docClient, {
      TableName: 'Questions',
      ProjectionExpression: 'examType, createdAt, validityCheckedAt',
    });
    // AWS専用サイトのためAWS以外の試験種別（OCIAA等）を除外
    const AWS_EXAM_TYPES = new Set(['CLF','AIF','SAA','DVA','SOA','DEA','MLA','SAP','DOP','GAI','AIP','ANS','SCS']);
    const items = allItems.filter(item => !item.examType || AWS_EXAM_TYPES.has(item.examType));

    // JST (UTC+9)
    const jstMs = Date.now() + 9 * 60 * 60 * 1000;
    const jstNow = new Date(jstMs);

    // 直近14日
    const daily = [];
    for (let i = 13; i >= 0; i--) {
      daily.push(new Date(jstMs - i * 86400000).toISOString().slice(0, 10));
    }

    // 直近6ヶ月
    const monthly = [];
    const jstYear = parseInt(jstNow.toISOString().slice(0, 4));
    const jstMonthIdx = parseInt(jstNow.toISOString().slice(5, 7)) - 1;
    for (let i = 5; i >= 0; i--) {
      let m = jstMonthIdx - i;
      let y = jstYear;
      while (m < 0) { m += 12; y--; }
      monthly.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    }

    const createdByDay = Object.fromEntries(daily.map(d => [d, 0]));
    const verifiedByDay = Object.fromEntries(daily.map(d => [d, 0]));
    const createdByMonth = Object.fromEntries(monthly.map(m => [m, 0]));
    const verifiedByMonth = Object.fromEntries(monthly.map(m => [m, 0]));

    let createdBeforeDaily = 0, verifiedBeforeDaily = 0;
    let createdBeforeMonthly = 0, verifiedBeforeMonthly = 0;

    const toJstDay = (iso) => new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toJstMonth = (iso) => new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);

    for (const item of items) {
      if (item.createdAt) {
        const day = toJstDay(item.createdAt);
        const month = toJstMonth(item.createdAt);
        if (createdByDay[day] !== undefined) createdByDay[day]++;
        else createdBeforeDaily++;
        if (createdByMonth[month] !== undefined) createdByMonth[month]++;
        else createdBeforeMonthly++;
      } else {
        createdBeforeDaily++;
        createdBeforeMonthly++;
      }
      if (item.validityCheckedAt) {
        const day = toJstDay(item.validityCheckedAt);
        const month = toJstMonth(item.validityCheckedAt);
        if (verifiedByDay[day] !== undefined) verifiedByDay[day]++;
        else if (day < daily[0]) verifiedBeforeDaily++;
        if (verifiedByMonth[month] !== undefined) verifiedByMonth[month]++;
        else if (month < monthly[0]) verifiedBeforeMonthly++;
      }
    }

    let cumC = createdBeforeDaily, cumV = verifiedBeforeDaily;
    const dailyCreatedCum = daily.map(d => { cumC += createdByDay[d]; return cumC; });
    const dailyVerifiedCum = daily.map(d => { cumV += verifiedByDay[d]; return cumV; });

    cumC = createdBeforeMonthly; cumV = verifiedBeforeMonthly;
    const monthlyCreatedCum = monthly.map(m => { cumC += createdByMonth[m]; return cumC; });
    const monthlyVerifiedCum = monthly.map(m => { cumV += verifiedByMonth[m]; return cumV; });

    const totalVerified = items.filter(item => item.validityCheckedAt).length;

    res.json({
      daily: {
        dates: daily,
        created: daily.map(d => createdByDay[d]),
        verified: daily.map(d => verifiedByDay[d]),
        createdCumulative: dailyCreatedCum,
        verifiedCumulative: dailyVerifiedCum,
      },
      monthly: {
        months: monthly,
        created: monthly.map(m => createdByMonth[m]),
        verified: monthly.map(m => verifiedByMonth[m]),
        createdCumulative: monthlyCreatedCum,
        verifiedCumulative: monthlyVerifiedCum,
      },
      total: items.length,
      totalVerified,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SSG用：検証済み問題を試験別に一括取得（Next.jsビルド時 / 静的ページ生成専用）
// フィールド射影で最小限のペイロードを返し、ビルド時間を短縮する
app.get('/questions/public', async (req, res) => {
  try {
    const docClient = getClient();
    const { examType } = req.query;
    if (!examType) return res.status(400).json({ error: 'examType required' });

    const FIELDS = 'questionId, examType, #qt, choices, correctAnswerIndices, correctAnswers, choiceExplanations, explanation, #dom, isMultiple, validityCheckedAt';
    let items = [];
    let lastKey = undefined;
    do {
      const params = {
        TableName: 'Questions',
        FilterExpression: 'examType = :e AND attribute_exists(validityCheckedAt)',
        ExpressionAttributeValues: { ':e': examType },
        ExpressionAttributeNames: { '#qt': 'questionText', '#dom': 'domain' },
        ProjectionExpression: FIELDS,
      };
      if (lastKey) params.ExclusiveStartKey = lastKey;
      const result = await docClient.send(new ScanCommand(params));
      items = items.concat(result.Items || []);
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    res.json({ items, count: items.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// 問題一覧取得
app.get('/questions', async (req, res) => {
  try {
    const docClient = getClient();
    const { examType, tagId, domain, limit, shuffle: doShuffle, keyword, offset, ids } = req.query;
    let items = [];

    if (tagId) {
      const relResult = await docClient.send(new QueryCommand({
        TableName: 'QuestionTagRelations',
        KeyConditionExpression: 'tagId = :tagId',
        ExpressionAttributeValues: { ':tagId': tagId }
      }));
      const promises = relResult.Items.map(i =>
        docClient.send(new GetCommand({ TableName: 'Questions', Key: { questionId: i.questionId } }))
      );
      const results = await Promise.all(promises);
      items = results.map(r => r.Item).filter(Boolean);
      if (examType) items = items.filter(q => q.examType === examType);
    } else if (examType) {
      items = await getAllQuestionsForExam(docClient, examType);
    } else {
      items = await scanAll(docClient, { TableName: 'Questions' });
    }

    if (domain) {
      const domainList = domain.split(',').map(d => d.trim()).filter(Boolean);
      items = items.filter(q => domainList.includes(qDomainName(q)));
    }
    if (ids) {
      const idSet = new Set(ids.split(',').map(id => id.trim()).filter(Boolean));
      items = items.filter(q => idSet.has(q.questionId));
    }
    if (keyword) {
      const keywords = keyword.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      items = items.filter(q =>
        keywords.every(kw =>
          q.questionText.toLowerCase().includes(kw) ||
          (q.choices || []).some(c => c.toLowerCase().includes(kw)) ||
          q.questionId.toLowerCase().includes(kw)
        )
      );
    }

    items = items.filter(q => !q.isHidden && !!q.validityCheckedAt);
    if (doShuffle === 'true') items = shuffle(items);
    const total = items.length;
    if (offset) items = items.slice(parseInt(offset));
    if (limit) items = items.slice(0, parseInt(limit));

    // metaOnly=true: 選択ロジックに必要な最小フィールドのみ返す（フロントのPhase1軽量化用）
    // questionText・choices 等を除外することでペイロードを約 1/10 に削減する
    if (req.query.metaOnly === 'true') {
      return res.json({
        items: items.map(q => ({
          questionId: q.questionId,
          domain: q.domain,
          examType: q.examType,
          aiVerified: q.aiVerified,
        })),
        count: items.length, total,
      });
    }

    // idsOnly=true: 問題IDのみ返す（プログレッシブロード用・フィルタ対応）
    if (req.query.idsOnly === 'true') {
      const { bookmarkOnly, unansweredOnly, incorrectOnly, userId: qUserId } = req.query;
      const hasFilter = qUserId && (bookmarkOnly === 'true' || unansweredOnly === 'true' || incorrectOnly === 'true');
      if (hasFilter) {
        const statsResult = await docClient.send(new QueryCommand({
          TableName: 'UserQuestionStats',
          KeyConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: { ':uid': qUserId }
        }));
        const stats = statsResult.Items || [];
        const bookmarkSet  = bookmarkOnly   === 'true' ? new Set(stats.filter(s => s.bookmarked).map(s => s.questionId)) : null;
        const answeredSet  = unansweredOnly === 'true' ? new Set(stats.map(s => s.questionId)) : null;
        const incorrectSet = incorrectOnly  === 'true' ? new Set(stats.filter(s => (s.incorrectCount ?? 0) > 0).map(s => s.questionId)) : null;
        items.sort((a, b) => {
          const score = q =>
            (bookmarkSet  && bookmarkSet.has(q.questionId)   ? 1 : 0) +
            (answeredSet  && !answeredSet.has(q.questionId)  ? 1 : 0) +
            (incorrectSet && incorrectSet.has(q.questionId)  ? 1 : 0);
          return score(b) - score(a);
        });
      }
      return res.json({ questionIds: items.map(q => q.questionId), total: items.length });
    }

    const withAnswers = req.query.withAnswers === 'true';
    const sanitized = withAnswers
      ? items.map(item => {
          const n = normalizeQuestion(item);
          return { ...n, correctAnswerCount: n.correctAnswerIndices.length || 1 };
        })
      : items.map(item => {
          const { correctAnswers, explanation, explanationEn, ...rest } = item;
          const n = normalizeQuestion({ ...rest, correctAnswers: [] });
          return { ...n, correctAnswerCount: Array.isArray(correctAnswers) ? correctAnswers.length : 1 };
        });
    res.json({ items: sanitized, count: sanitized.length, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 問題1件取得
app.get('/questions/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({
      TableName: 'Questions',
      Key: { questionId: req.params.id }
    }));
    if (!result.Item) return res.status(404).json({ error: 'Question not found' });
    res.json(normalizeQuestion(result.Item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 通報
app.post('/questions/:id/report', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, category, message } = req.body;
    await docClient.send(new PutCommand({
      TableName: 'Reports',
      Item: {
        questionId: req.params.id,
        reportId: uuidv4(),
        userId: userId || 'anonymous',
        category: category || 'other',
        message: message || '',
        reportedAt: new Date().toISOString()
      }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 問題削除（管理者用） ※/admin配下に置くことでrequireAdminが適用される
app.delete('/admin/questions/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const questionId = req.params.id;

    // QuestionTagRelations の関連レコードを取得して削除
    const relResult = await docClient.send(new ScanCommand({
      TableName: 'QuestionTagRelations',
      FilterExpression: 'questionId = :qid',
      ExpressionAttributeValues: { ':qid': questionId }
    }));
    const deleteRels = (relResult.Items || []).map(item =>
      docClient.send(new DeleteCommand({
        TableName: 'QuestionTagRelations',
        Key: { tagId: item.tagId, questionId: item.questionId }
      }))
    );
    await Promise.all(deleteRels);

    await docClient.send(new DeleteCommand({
      TableName: 'Questions',
      Key: { questionId }
    }));

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 問題一括インポート（管理者用）
app.post('/admin/questions', async (req, res) => {
  try {
    const docClient = getClient();
    const { examType, domain, questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'questions must be a non-empty array' });
    }

    const now = new Date().toISOString();
    const created = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const itemExamType = q.examType || examType;
      const shortId = uuidv4().replace(/-/g, '').slice(0, 8);
      const questionId = `${itemExamType.toLowerCase()}-${shortId}`;

      // domain をインデックスに正規化（名前 or インデックス → 整数）
      const rawDomain = q.domain ?? domain;
      const domainIdx = rawDomain !== undefined && rawDomain !== null ? qDomainIndex(itemExamType, rawDomain) : -1;

      // correctAnswerIndices を生成（未設定の場合）
      let correctAnswerIndices = q.correctAnswerIndices;
      if (!correctAnswerIndices && Array.isArray(q.correctAnswers) && Array.isArray(q.choices)) {
        correctAnswerIndices = q.correctAnswers
          .map(ca => q.choices.findIndex(c => c === ca || c.replace(/^[A-E]\.\s*/, '') === ca.replace(/^[A-E]\.\s*/, '')))
          .filter(idx => idx >= 0);
      }

      const item = {
        questionId,
        examType: itemExamType,
        questionText: q.questionText,
        choices: q.choices,
        correctAnswers: q.correctAnswers,
        explanation: q.explanation || '',
        isMultiple: q.isMultiple ?? false,
        createdAt: now,
      };
      if (domainIdx >= 0) item.domain = domainIdx;
      if (correctAnswerIndices && correctAnswerIndices.length > 0) item.correctAnswerIndices = correctAnswerIndices;
      if (q.questionTextEn) item.questionTextEn = q.questionTextEn;
      if (q.choicesEn && q.choicesEn.length > 0) item.choicesEn = q.choicesEn;
      if (q.explanationEn) item.explanationEn = q.explanationEn;
      if (Array.isArray(q.choiceExplanations) && q.choiceExplanations.length === q.choices.length) {
        item.choiceExplanations = q.choiceExplanations;
      }

      await docClient.send(new PutCommand({ TableName: 'Questions', Item: item }));

      created.push(questionId);
    }

    res.json({ created, count: created.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：問題更新
app.put('/admin/questions/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const questionId = req.params.id;
    const { questionText, questionTextEn, choices, choicesEn, correctAnswers, explanation, explanationEn, domain, isMultiple, examType } = req.body;

    // domain を整数インデックスに変換
    const domainIdx = qDomainIndex(examType, domain);

    const correctAnswerIndices = (correctAnswers || [])
      .map(ca => (choices || []).findIndex(c => c === ca))
      .filter(idx => idx >= 0);

    const setParts = ['questionText = :qt', 'choices = :ch', 'correctAnswers = :ca', 'correctAnswerIndices = :ci', 'explanation = :ex', '#d = :d', 'isMultiple = :im', 'examType = :et', 'updatedAt = :ua'];
    const removeParts = ['tags'];  // 旧 tags フィールドを削除（domain 整数に移行済み）
    const exprNames = { '#d': 'domain' };
    const exprValues = {
      ':qt': questionText,
      ':ch': choices,
      ':ca': correctAnswers,
      ':ci': correctAnswerIndices,
      ':ex': explanation || '',
      ':d': domainIdx >= 0 ? domainIdx : 0,
      ':im': isMultiple ?? false,
      ':et': examType,
      ':ua': new Date().toISOString(),
    };

    if (questionTextEn) { setParts.push('questionTextEn = :qte'); exprValues[':qte'] = questionTextEn; }
    else { removeParts.push('questionTextEn'); }
    if (choicesEn && choicesEn.length > 0) { setParts.push('choicesEn = :che'); exprValues[':che'] = choicesEn; }
    else { removeParts.push('choicesEn'); }
    if (explanationEn) { setParts.push('explanationEn = :exe'); exprValues[':exe'] = explanationEn; }
    else { removeParts.push('explanationEn'); }

    let updateExpr = 'SET ' + setParts.join(', ');
    if (removeParts.length > 0) updateExpr += ' REMOVE ' + removeParts.join(', ');

    await docClient.send(new UpdateCommand({
      TableName: 'Questions',
      Key: { questionId },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 問題数サマリー（examCounts・domainCounts）— 軽量スキャン
app.get('/admin/questions/summary', async (req, res) => {
  try {
    const docClient = getClient();
    const { sinceDate } = req.query;
    const EXAM_TYPE_LIST = Object.keys(EXAM_DOMAINS);
    // Scan の代わりに examType-index を使って各試験種別を並行 Query
    const perExamItems = await Promise.all(EXAM_TYPE_LIST.map(et =>
      queryAll(docClient, {
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :e',
        ExpressionAttributeValues: { ':e': et },
        ProjectionExpression: 'examType, #dom, isHidden, validityCheckedAt, formatCheckedAt',
        ExpressionAttributeNames: { '#dom': 'domain' },
      })
    ));
    const items = perExamItems.flat();
    const visible = items.filter(i => !i.isHidden);
    const examCounts = {};
    const domainCounts = {};
    for (const item of visible) {
      const { examType } = item;
      examCounts[examType] = (examCounts[examType] || 0) + 1;
      if (!domainCounts[examType]) domainCounts[examType] = {};
      const dn = qDomainName(item);
      if (dn) domainCounts[examType][dn] = (domainCounts[examType][dn] || 0) + 1;
    }
    const validityCheckedCount = visible.filter(i => i.validityCheckedAt).length;
    const formatCheckedCount   = visible.filter(i => i.formatCheckedAt).length;
    const result = { examCounts, domainCounts, totalCount: visible.length, validityCheckedCount, formatCheckedCount };
    if (sinceDate && /^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
      const threshold = sinceDate + 'T00:00:00';
      result.validityCheckedSinceCount = visible.filter(i => i.validityCheckedAt && i.validityCheckedAt >= threshold).length;
      result.formatCheckedSinceCount   = visible.filter(i => i.formatCheckedAt   && i.formatCheckedAt   >= threshold).length;
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 正当性チェック済み問題一覧
// ?filter=flagged → rating<=2 または isHidden=true のみ
// ?filter=hidden  → isHidden=true のみ
// デフォルト      → validityCheckedAt があるもの全件
app.get('/admin/questions/flagged', async (req, res) => {
  try {
    const docClient = getClient();
    const { filter } = req.query;

    let scanParams = { TableName: 'Questions' };
    if (filter === 'flagged') {
      scanParams.FilterExpression = 'validityRating <= :threshold OR isHidden = :hidden';
      scanParams.ExpressionAttributeValues = { ':threshold': 2, ':hidden': true };
    } else if (filter === 'hidden') {
      scanParams.FilterExpression = 'isHidden = :hidden';
      scanParams.ExpressionAttributeValues = { ':hidden': true };
    } else {
      scanParams.FilterExpression = 'attribute_exists(validityCheckedAt)';
    }
    scanParams.ProjectionExpression = 'questionId, examType, questionText, choices, correctAnswers, explanation, #dom, isMultiple, validityCheckedAt, formatCheckedAt, validityEditLog, isHidden, validityRating, validityNote, fixProposalJson';
    scanParams.ExpressionAttributeNames = { '#dom': 'domain' };

    // フィルタ済みアイテム取得 + 全件数を examType-index Query で並行取得
    const EXAM_TYPE_LIST = Object.keys(EXAM_DOMAINS);
    const [checkedItems, perExamCounts] = await Promise.all([
      scanAll(docClient, scanParams),
      Promise.all(EXAM_TYPE_LIST.map(et =>
        docClient.send(new QueryCommand({
          TableName: 'Questions',
          IndexName: 'examType-index',
          KeyConditionExpression: 'examType = :e',
          ExpressionAttributeValues: { ':e': et },
          Select: 'COUNT',
        })).then(r => r.Count || 0)
      )),
    ]);
    const totalCount = perExamCounts.reduce((s, c) => s + c, 0);
    const items = checkedItems.sort((a, b) => (a.validityRating || 9) - (b.validityRating || 9));
    res.json({ items, count: items.length, totalCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 修正案を適用
app.post('/admin/questions/:id/apply-fix', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({ TableName: 'Questions', Key: { questionId: req.params.id } }));
    const q = result.Item;
    if (!q || !q.fixProposalJson) return res.status(404).json({ error: 'Fix proposal not found' });

    const fix = JSON.parse(q.fixProposalJson);
    const sets = ['validityNote = :note'];
    const vals = { ':note': '修正適用済' };

    if (fix.questionText)  { sets.push('questionText = :qt');    vals[':qt'] = fix.questionText; }
    if (fix.choices)       { sets.push('choices = :ch');         vals[':ch'] = fix.choices; }
    if (fix.correctAnswers){ sets.push('correctAnswers = :ca');  vals[':ca'] = fix.correctAnswers; }
    if (fix.choices || fix.correctAnswers) {
      const finalChoices = fix.choices || q.choices || [];
      const finalCorrectAnswers = fix.correctAnswers || q.correctAnswers || [];
      const newIndices = finalCorrectAnswers
        .map(ca => finalChoices.findIndex(c => c === ca))
        .filter(idx => idx >= 0);
      sets.push('correctAnswerIndices = :ci');
      vals[':ci'] = newIndices;
    }
    if (fix.explanation)   { sets.push('explanation = :ex');     vals[':ex'] = fix.explanation; }

    await docClient.send(new UpdateCommand({
      TableName: 'Questions',
      Key: { questionId: req.params.id },
      UpdateExpression: 'SET ' + sets.join(', ') + ' REMOVE fixProposalJson',
      ExpressionAttributeValues: vals,
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 修正案を却下（クリア）
app.post('/admin/questions/:id/reject-fix', async (req, res) => {
  try {
    const docClient = getClient();
    await docClient.send(new UpdateCommand({
      TableName: 'Questions',
      Key: { questionId: req.params.id },
      UpdateExpression: 'REMOVE fixProposalJson',
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 表示/非表示切り替え
app.put('/admin/questions/:id/visibility', async (req, res) => {
  try {
    const docClient = getClient();
    const { isHidden } = req.body;
    await docClient.send(new UpdateCommand({
      TableName: 'Questions',
      Key: { questionId: req.params.id },
      UpdateExpression: 'SET isHidden = :v',
      ExpressionAttributeValues: { ':v': !!isHidden },
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/admin/questions/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({
      TableName: 'Questions',
      Key: { questionId: req.params.id },
    }));
    if (!result.Item) return res.status(404).json({ error: 'Question not found' });
    res.json(result.Item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/admin/questions', async (req, res) => {
  try {
    const docClient = getClient();
    const { examType, keyword, tag, domain, page, pageSize } = req.query;
    const pageNum = Math.max(0, parseInt(page) || 0);
    const pageSz = Math.min(500, Math.max(1, parseInt(pageSize) || 100));
    const isAll = !examType || examType === 'ALL';
    let items = [];

    if (!isAll) {
      items = await queryAll(docClient, {
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :examType',
        ExpressionAttributeValues: { ':examType': examType }
      });
    } else {
      // explanation・validityEditLog を除外して 6MB 上限を回避（編集時は GET /admin/questions/:id で取得）
      items = await scanAll(docClient, {
        TableName: 'Questions',
        ProjectionExpression: 'questionId, examType, questionText, choices, correctAnswers, correctAnswerIndices, #dom, isMultiple, isHidden, createdAt, updatedAt, validityCheckedAt, formatCheckedAt',
        ExpressionAttributeNames: { '#dom': 'domain' },
      });
    }

    if (tag) items = items.filter(q => qDomainName(q) === tag);
    if (domain) {
      const domainList = domain.split(',').map(d => d.trim()).filter(Boolean);
      items = items.filter(q => domainList.includes(qDomainName(q)));
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      items = items.filter(q =>
        q.questionId.toLowerCase().includes(kw) ||
        (q.questionText || '').toLowerCase().includes(kw)
      );
    }

    const { sort: sortParam = 'id_asc' } = req.query;
    const [sortField, sortDir] = sortParam.split('_');
    items.sort((a, b) => {
      if (sortField === 'updatedAt') {
        const da = a.updatedAt || '0', db = b.updatedAt || '0';
        return sortDir === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
      } else if (sortField === 'validityCheckedAt') {
        const da = a.validityCheckedAt || '0', db = b.validityCheckedAt || '0';
        return sortDir === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
      } else if (sortField === 'createdAt') {
        const da = a.createdAt || '0', db = b.createdAt || '0';
        return sortDir === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
      } else if (sortField === 'formatCheckedAt') {
        const da = a.formatCheckedAt || '0', db = b.formatCheckedAt || '0';
        return sortDir === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
      } else {
        return a.questionId.localeCompare(b.questionId);
      }
    });

    const total = items.length;
    const pagedItems = items.slice(pageNum * pageSz, (pageNum + 1) * pageSz);

    res.json({ items: pagedItems, count: pagedItems.length, total, page: pageNum, pageSize: pageSz });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// 通報一覧（管理者用）
app.get('/admin/reports', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new ScanCommand({ TableName: 'Reports' }));
    const items = (result.Items || []).sort((a, b) =>
      new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
    );
    res.json({ items, count: items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 通報削除（管理者用・解決済みマーク）
// Reports テーブルは questionId(HASH) + reportId(RANGE) の複合キー
app.delete('/admin/reports/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const { questionId } = req.query;
    if (!questionId) return res.status(400).json({ error: 'questionId is required' });
    await docClient.send(new DeleteCommand({
      TableName: 'Reports',
      Key: { questionId, reportId: req.params.id }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// セッション開始
app.post('/sessions', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, mode, examType, questionIds, isMini, isFocused } = req.body;
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const item = {
      userId, sessionId, mode, examType, questionIds,
      status: 'active', startedAt: now, lastAnsweredAt: now, score: 0, isPassed: false
    };
    if (isMini) item.isMini = true;
    if (isFocused) item.isFocused = true;
    await docClient.send(new PutCommand({ TableName: 'Sessions', Item: item }));
    res.json({ sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 未完了セッション確認
// 回答記録
app.post('/sessions/:id/answers', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, questionId, selectedAnswers, isCorrect, examType } = req.body;
    const now = new Date().toISOString();
    const questionIdTimestamp = `${req.params.id}#${questionId}#${now}`;

    // UserAnswers（回答ログ）と UserQuestionStats（問題別正誤）を原子的に記録。
    // どちらも問題ID単位の別項目なので、複数回答が並列送信されても競合しない。
    // 解放カウントは GET /question-stats が UserQuestionStats から都度集計するため、
    // ここで共有カウンタを更新しない（並列時の TransactionConflict / examType 欠落でドリフトしていた）。
    const transactItems = [
      {
        Put: {
          TableName: 'UserAnswers',
          Item: { userId, questionIdTimestamp, questionId, sessionId: req.params.id, selectedAnswers, isCorrect, answeredAt: now }
        }
      },
      {
        Update: {
          TableName: 'UserQuestionStats',
          Key: { userId, questionId },
          UpdateExpression: isCorrect
            ? 'ADD correctCount :one SET lastAnsweredAt = :now'
            : 'ADD incorrectCount :one SET lastAnsweredAt = :now',
          ExpressionAttributeValues: { ':one': 1, ':now': now }
        }
      }
    ];

    await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// セッション別回答詳細取得
app.get('/sessions/:id/answers', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.query;
    const sessionId = req.params.id;

    const answersResult = await docClient.send(new QueryCommand({
      TableName: 'UserAnswers',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'sessionId = :sid',
      ExpressionAttributeValues: { ':uid': userId, ':sid': sessionId },
    }));

    const answers = answersResult.Items || [];
    const questionIds = [...new Set(answers.map(a => a.questionId))];

    const questions = await Promise.all(
      questionIds.map(qid =>
        docClient.send(new GetCommand({
          TableName: 'Questions',
          Key: { questionId: qid },
          ProjectionExpression: 'questionId, questionText',
        })).then(r => r.Item).catch(() => null)
      )
    );
    const qMap = Object.fromEntries(questions.filter(Boolean).map(q => [q.questionId, q]));

    const result = answers
      .map(a => ({
        questionId: a.questionId,
        questionText: qMap[a.questionId]?.questionText ?? '',
        isCorrect: a.isCorrect,
        answeredAt: a.answeredAt,
      }))
      .sort((a, b) => (a.answeredAt > b.answeredAt ? 1 : -1));

    res.json({ answers: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ドメイン別直近正誤保存（デバイス間共有用）
app.put('/users/me/domain-results', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, domainResults } = req.body;
    if (!userId || !domainResults || typeof domainResults !== 'object') {
      return res.status(400).json({ error: 'userId and domainResults are required' });
    }
    await Promise.all(
      Object.entries(domainResults).map(([tagId, results]) =>
        docClient.send(new UpdateCommand({
          TableName: 'UserTagStats',
          Key: { userId, tagId },
          UpdateExpression: 'SET recentResults = :r',
          ExpressionAttributeValues: { ':r': results }
        }))
      )
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// セッション終了
app.put('/sessions/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, status, score, isPassed, examType, answeredCount } = req.body;
    const now = new Date().toISOString();
    await docClient.send(new UpdateCommand({
      TableName: 'Sessions',
      Key: { userId, sessionId: req.params.id },
      UpdateExpression: 'SET #s = :status, score = :score, isPassed = :isPassed, endedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status, ':score': score, ':isPassed': isPassed, ':now': now }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// セッション結果取得
app.get('/sessions/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.query;
    const result = await docClient.send(new GetCommand({
      TableName: 'Sessions',
      Key: { userId, sessionId: req.params.id }
    }));
    if (!result.Item) return res.status(404).json({ error: 'Session not found' });
    res.json(result.Item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 演習済み問題数取得
app.get('/users/me/question-stats', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, examType } = req.query;
    if (!userId || !examType) return res.json({ answeredCount: 0 });

    // 解放カウント（しっかり対策・苦手分析）= 演習量。
    // UserQuestionStats を唯一の真実源として毎回集計する。
    // （保存カウンタ + 増分方式はトランザクション競合・examType 欠落でドリフトするため廃止）
    // correctCount + incorrectCount の合計 = 解いた問題数（正誤・重複問わず）。
    const PREFIX_MAP = { 'gai': 'AIP' };
    const statsResult = await docClient.send(new QueryCommand({
      TableName: 'UserQuestionStats',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'questionId, correctCount, incorrectCount',
    }));
    const answeredCount = (statsResult.Items || [])
      .filter(s => {
        const prefix = (s.questionId || '').split('-')[0].toLowerCase();
        return (PREFIX_MAP[prefix] ?? prefix.toUpperCase()) === examType;
      })
      .reduce((sum, s) => sum + (s.correctCount ?? 0) + (s.incorrectCount ?? 0), 0);

    res.json({ answeredCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// セッション履歴取得
app.get('/users/me/sessions', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, limit } = req.query;
    const result = await docClient.send(new QueryCommand({
      TableName: 'Sessions',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: '#s = :completed',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':uid': userId, ':completed': 'completed' }
    }));
    const items = (result.Items || [])
      .sort((a, b) => ((b.endedAt || b.startedAt) > (a.endedAt || a.startedAt) ? 1 : -1))
      .slice(0, parseInt(limit) || 20);
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 統計取得
app.get('/users/me/stats', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.query;
    const [statsResult, resetResult] = await Promise.all([
      docClient.send(new QueryCommand({
        TableName: 'UserTagStats',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
      })),
      docClient.send(new GetCommand({
        TableName: 'AppSettings',
        Key: { settingId: `userReset_${userId}` },
      })),
    ]);
    res.json({
      stats: statsResult.Items || [],
      resetAt: resetResult.Item?.resetAt || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ユーザー演習データ削除（試験種別ごと）
app.delete('/users/me/data', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, examType } = req.query;
    if (!userId || !examType) return res.status(400).json({ error: 'userId and examType are required' });

    const deleteItems = async (table, keys) => {
      if (keys.length === 0) return;
      await Promise.all(keys.map(key => docClient.send(new DeleteCommand({ TableName: table, Key: key }))));
    };

    // 1. examType の questionId 一覧を取得
    const questionsResult = await docClient.send(new QueryCommand({
      TableName: 'Questions',
      IndexName: 'examType-index',
      KeyConditionExpression: 'examType = :et',
      ExpressionAttributeValues: { ':et': examType },
      ProjectionExpression: 'questionId',
    }));
    const questionIds = (questionsResult.Items || []).map(q => q.questionId);

    // 2. UserQuestionStats 削除
    await deleteItems('UserQuestionStats', questionIds.map(qid => ({ userId, questionId: qid })));

    // 3. UserTagStats 削除（ドメインタグのみ）
    const domains = EXAM_DOMAINS[examType] || [];
    await deleteItems('UserTagStats', domains.map(tagId => ({ userId, tagId })));

    // 4. Sessions を取得
    const sessionsResult = await docClient.send(new QueryCommand({
      TableName: 'Sessions',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'examType = :et',
      ExpressionAttributeValues: { ':uid': userId, ':et': examType },
    }));
    const sessionIds = (sessionsResult.Items || []).map(s => s.sessionId);

    // 5. UserAnswers 削除（セッションごとにクエリ）
    for (const sessionId of sessionIds) {
      let lastKey;
      do {
        const answersResult = await docClient.send(new QueryCommand({
          TableName: 'UserAnswers',
          KeyConditionExpression: 'userId = :uid AND begins_with(questionIdTimestamp, :prefix)',
          ExpressionAttributeValues: { ':uid': userId, ':prefix': `${sessionId}#` },
          ExclusiveStartKey: lastKey,
        }));
        const answerKeys = (answersResult.Items || []).map(a => ({ userId: a.userId, questionIdTimestamp: a.questionIdTimestamp }));
        await deleteItems('UserAnswers', answerKeys);
        lastKey = answersResult.LastEvaluatedKey;
      } while (lastKey);
    }

    // 6. Sessions 削除
    await deleteItems('Sessions', sessionIds.map(sid => ({ userId, sessionId: sid })));

    // 7. スコア履歴削除
    try {
      await docClient.send(new DeleteCommand({
        TableName: 'AppSettings',
        Key: { settingId: `scoreHistData_${userId}_${examType}` },
      }));
    } catch {}

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ユーザー自身のデータ全初期化（Cognitoアカウント・メール・パスワードは保持）
// executeUserDataDeletion より高速: 全ページ取得 + 並列削除 + UserAnswers は孤児化
async function executeUserDataReset(docClient, userId) {
  const batchDelete = async (table, keys) => {
    if (keys.length === 0) return;
    const CHUNK = 25;
    const chunks = [];
    for (let i = 0; i < keys.length; i += CHUNK) chunks.push(keys.slice(i, i + CHUNK));
    await Promise.all(chunks.map(chunk =>
      Promise.all(chunk.map(key => docClient.send(new DeleteCommand({ TableName: table, Key: key }))))
    ));
  };

  const [qsItems, tsItems, sessItems] = await Promise.all([
    queryAll(docClient, {
      TableName: 'UserQuestionStats',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'userId, questionId',
    }),
    queryAll(docClient, {
      TableName: 'UserTagStats',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'userId, tagId',
    }),
    queryAll(docClient, {
      TableName: 'Sessions',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'userId, sessionId',
    }),
  ]);

  await Promise.all([
    batchDelete('UserQuestionStats', qsItems.map(i => ({ userId: i.userId, questionId: i.questionId }))),
    batchDelete('UserTagStats',      tsItems.map(i => ({ userId: i.userId, tagId: i.tagId }))),
    batchDelete('Sessions',          sessItems.map(i => ({ userId: i.userId, sessionId: i.sessionId }))),
    // DELETE より PUT（空上書き）の方が確実 — delete は存在しないキーに対してもエラーにならないが、
    // 型不一致や権限エラーで失敗しても catch で隠れるため、空レコードで上書きする
    docClient.send(new PutCommand({
      TableName: 'EncyclopediaUnlocks',
      Item: { userId, unlocks: '{}', unlockDate: null, todayServiceId: null },
    })).catch(() => {}),
    docClient.send(new DeleteCommand({ TableName: 'UserPoints', Key: { userId } })).catch(() => {}),
    docClient.send(new UpdateCommand({
      TableName: 'AppSettings',
      Key: { settingId: `userPrefs_${userId}` },
      UpdateExpression: 'SET #targetExam = :null, #examDates = :empty',
      ExpressionAttributeNames: { '#targetExam': 'targetExam', '#examDates': 'examDates' },
      ExpressionAttributeValues: { ':null': null, ':empty': {} },
    })).catch(() => {}),
  ]);

  // AppSettings のユーザー固有データを削除（スコア履歴・解答カウンター）
  const appSettingsResult = await docClient.send(new ScanCommand({
    TableName: 'AppSettings',
    FilterExpression: 'begins_with(settingId, :sh) OR begins_with(settingId, :ac)',
    ExpressionAttributeValues: {
      ':sh': `scoreHistData_${userId}_`,
      ':ac': `answeredCount_${userId}_`,
    },
    ProjectionExpression: 'settingId',
  }));
  await batchDelete('AppSettings', (appSettingsResult.Items || []).map(i => ({ settingId: i.settingId })));

  const resetAt = new Date().toISOString();
  await docClient.send(new PutCommand({
    TableName: 'AppSettings',
    Item: { settingId: `userReset_${userId}`, userId, resetAt },
  }));
  return resetAt;
}

app.post('/users/me/reset', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const resetAt = await executeUserDataReset(docClient, userId);
    res.json({ success: true, resetAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── スコア履歴（デバイス間同期） ──

app.get('/users/me/score-history', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, examType } = req.query;
    if (!userId || !examType) return res.status(400).json({ error: 'userId and examType are required' });
    const result = await docClient.send(new GetCommand({
      TableName: 'AppSettings',
      Key: { settingId: `scoreHistData_${userId}_${examType}` },
    }));
    const item = result.Item || {};
    res.json({
      scoreHistory: item.scoreHistory || [],
      sessionScoreHistory: item.sessionScoreHistory || [],
      sessionScoreLog: item.sessionScoreLog || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/users/me/score-history', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, examType, scoreHistory, sessionScoreHistory, sessionScoreLog } = req.body;
    if (!userId || !examType) return res.status(400).json({ error: 'userId and examType are required' });
    const updateParts = [];
    const exprValues = {};
    if (scoreHistory !== undefined) { updateParts.push('scoreHistory = :sh'); exprValues[':sh'] = scoreHistory; }
    if (sessionScoreHistory !== undefined) { updateParts.push('sessionScoreHistory = :ssh'); exprValues[':ssh'] = sessionScoreHistory; }
    if (sessionScoreLog !== undefined) { updateParts.push('sessionScoreLog = :ssl'); exprValues[':ssl'] = sessionScoreLog; }
    if (updateParts.length === 0) return res.json({ success: true });
    await docClient.send(new UpdateCommand({
      TableName: 'AppSettings',
      Key: { settingId: `scoreHistData_${userId}_${examType}` },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeValues: exprValues,
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Tips（コラム）──

// 演習モード用：試験種別に合うコラムを全件返す
app.get('/tips', async (req, res) => {
  try {
    const docClient = getClient();
    const { examType } = req.query;
    const result = await docClient.send(new ScanCommand({
      TableName: 'Tips',
      ...(examType ? {
        FilterExpression: 'examType = :et OR examType = :all',
        ExpressionAttributeValues: { ':et': examType, ':all': 'ALL' }
      } : {})
    }));
    res.json({ items: result.Items || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：全件取得
app.get('/admin/tips', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new ScanCommand({ TableName: 'Tips' }));
    const items = (result.Items || []).sort((a, b) => a.examType.localeCompare(b.examType));
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：追加
app.post('/admin/tips', async (req, res) => {
  try {
    const docClient = getClient();
    const { examType, title, content } = req.body;
    const tipId = uuidv4();
    await docClient.send(new PutCommand({
      TableName: 'Tips',
      Item: { tipId, examType, title, content, createdAt: new Date().toISOString() }
    }));
    res.json({ tipId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：一括インポート
app.post('/admin/tips/bulk', async (req, res) => {
  try {
    const docClient = getClient();
    const { tips, defaultExamType } = req.body;
    if (!Array.isArray(tips) || tips.length === 0) {
      return res.status(400).json({ error: 'tips must be a non-empty array' });
    }
    const now = new Date().toISOString();
    const created = [];
    for (const tip of tips) {
      const tipId = uuidv4();
      await docClient.send(new PutCommand({
        TableName: 'Tips',
        Item: {
          tipId,
          examType: tip.examType || defaultExamType || 'ALL',
          title: tip.title,
          content: tip.content,
          createdAt: now,
        }
      }));
      created.push(tipId);
    }
    res.json({ created, count: created.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：更新
app.put('/admin/tips/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const { examType, title, content } = req.body;
    await docClient.send(new UpdateCommand({
      TableName: 'Tips',
      Key: { tipId: req.params.id },
      UpdateExpression: 'SET examType = :et, title = :t, content = :c',
      ExpressionAttributeValues: { ':et': examType, ':t': title, ':c': content }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：削除
app.delete('/admin/tips/:id', async (req, res) => {
  try {
    const docClient = getClient();
    await docClient.send(new DeleteCommand({
      TableName: 'Tips',
      Key: { tipId: req.params.id }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 回答済み問題ID一覧取得
app.get('/users/me/answered-questions', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, examType } = req.query;

    const statsResult = await docClient.send(new QueryCommand({
      TableName: 'UserQuestionStats',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId }
    }));

    let questionIds = (statsResult.Items || []).map(s => s.questionId);

    if (examType) {
      const questionsResult = await docClient.send(new QueryCommand({
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :et',
        ExpressionAttributeValues: { ':et': examType },
        ProjectionExpression: 'questionId'
      }));
      const examQuestionIds = new Set((questionsResult.Items || []).map(q => q.questionId));
      questionIds = questionIds.filter(id => examQuestionIds.has(id));
    }

    res.json({ questionIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 未正解問題ID一覧（incorrectCount > 0）
app.get('/users/me/incorrect-questions', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, examType } = req.query;

    const statsResult = await docClient.send(new QueryCommand({
      TableName: 'UserQuestionStats',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId }
    }));

    let stats = (statsResult.Items || []).filter(s => (s.incorrectCount ?? 0) > 0);

    if (examType) {
      const questionsResult = await docClient.send(new QueryCommand({
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :et',
        ExpressionAttributeValues: { ':et': examType },
        ProjectionExpression: 'questionId'
      }));
      const examQuestionIds = new Set((questionsResult.Items || []).map(q => q.questionId));
      stats = stats.filter(s => examQuestionIds.has(s.questionId));
    }

    const questionIds = stats.map(s => s.questionId);
    const counts = Object.fromEntries(stats.map(s => [s.questionId, s.incorrectCount ?? 0]));
    res.json({ questionIds, counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 頻出ミス問題（incorrectCount >= minIncorrect）
app.get('/users/me/weak-questions', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, examType, minIncorrect = '2' } = req.query;
    const threshold = parseInt(minIncorrect);

    const statsResult = await docClient.send(new QueryCommand({
      TableName: 'UserQuestionStats',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId }
    }));

    let candidates = (statsResult.Items || [])
      .filter(s => (s.incorrectCount ?? 0) >= threshold);

    if (examType) {
      const questionsResult = await docClient.send(new QueryCommand({
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :et',
        ExpressionAttributeValues: { ':et': examType },
        ProjectionExpression: 'questionId'
      }));
      const examQuestionIds = new Set((questionsResult.Items || []).map(q => q.questionId));
      candidates = candidates.filter(s => examQuestionIds.has(s.questionId));
    }

    candidates.sort((a, b) => (b.incorrectCount ?? 0) - (a.incorrectCount ?? 0));
    const top = candidates.slice(0, 30);

    if (top.length === 0) return res.json({ items: [] });

    const questionItems = await Promise.all(
      top.map(s => docClient.send(new GetCommand({
        TableName: 'Questions',
        Key: { questionId: s.questionId },
        ProjectionExpression: 'questionId, questionText'
      })).then(r => r.Item))
    );

    const items = top.map((s, i) => ({
      questionId: s.questionId,
      questionText: questionItems[i]?.questionText ?? '',
      correctCount: s.correctCount ?? 0,
      incorrectCount: s.incorrectCount ?? 0,
    })).filter(item => item.questionText);

    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ブックマーク追加
app.post('/questions/:id/bookmark', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.body;
    const now = new Date().toISOString();
    await docClient.send(new UpdateCommand({
      TableName: 'UserQuestionStats',
      Key: { userId, questionId: req.params.id },
      UpdateExpression: 'SET bookmarked = :b, lastAnsweredAt = if_not_exists(lastAnsweredAt, :now)',
      ExpressionAttributeValues: { ':b': true, ':now': now }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ブックマーク削除
app.delete('/questions/:id/bookmark', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.query;
    await docClient.send(new UpdateCommand({
      TableName: 'UserQuestionStats',
      Key: { userId, questionId: req.params.id },
      UpdateExpression: 'SET bookmarked = :b',
      ExpressionAttributeValues: { ':b': false }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ブックマーク一覧取得
app.get('/users/me/bookmarks', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.query;
    const result = await docClient.send(new QueryCommand({
      TableName: 'UserQuestionStats',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'bookmarked = :b',
      ExpressionAttributeValues: { ':uid': userId, ':b': true }
    }));
    const questionIds = (result.Items || []).map(item => item.questionId);
    res.json({ questionIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Releases（リリースノート）──

// 公開用：全件取得（日付降順）
app.get('/releases', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new ScanCommand({ TableName: 'Releases' }));
    const items = (result.Items || []).sort((a, b) => b.date.localeCompare(a.date));
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：全件取得
app.get('/admin/releases', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new ScanCommand({ TableName: 'Releases' }));
    const items = (result.Items || []).sort((a, b) => b.date.localeCompare(a.date));
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：追加
app.post('/admin/releases', async (req, res) => {
  try {
    const docClient = getClient();
    const { date, title, body } = req.body;
    if (!date || !title || !body) return res.status(400).json({ error: 'date, title, body are required' });
    const releaseId = uuidv4();
    await docClient.send(new PutCommand({
      TableName: 'Releases',
      Item: { releaseId, date, title, body, createdAt: new Date().toISOString() }
    }));
    res.json({ releaseId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：更新
app.put('/admin/releases/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const { date, title, body } = req.body;
    await docClient.send(new UpdateCommand({
      TableName: 'Releases',
      Key: { releaseId: req.params.id },
      UpdateExpression: 'SET #d = :date, title = :title, body = :body',
      ExpressionAttributeNames: { '#d': 'date' },
      ExpressionAttributeValues: { ':date': date, ':title': title, ':body': body }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：削除
app.delete('/admin/releases/:id', async (req, res) => {
  try {
    const docClient = getClient();
    await docClient.send(new DeleteCommand({
      TableName: 'Releases',
      Key: { releaseId: req.params.id }
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 連絡先メッセージ送信（認証不要） ──
app.post('/contact', async (req, res) => {
  try {
    const docClient = getClient();
    const { subject, message, userId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
    const item = {
      messageId: uuidv4(),
      subject: subject?.trim() || '',
      message: message.trim(),
      userId: userId || 'anonymous',
      sentAt: new Date().toISOString(),
    };
    await docClient.send(new PutCommand({ TableName: 'ContactMessages', Item: item }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：メッセージ一覧
app.get('/admin/messages', requireAdmin, async (req, res) => {
  try {
    const docClient = getClient();
    const data = await docClient.send(new ScanCommand({ TableName: 'ContactMessages' }));
    const items = (data.Items || []).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：メッセージ削除
app.delete('/admin/messages/:id', requireAdmin, async (req, res) => {
  try {
    const docClient = getClient();
    await docClient.send(new DeleteCommand({
      TableName: 'ContactMessages',
      Key: { messageId: req.params.id },
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DailyServices（今日のサービス）──

// 公開用：アクティブなサービス一覧（日替わり選択用）
app.get('/daily-service', async (req, res) => {
  try {
    const docClient = getClient();

    // ?serviceId= 指定時は特定サービスを返す（サービス図鑑の on-demand フェッチ用）
    if (req.query.serviceId) {
      const allItems = await getDailyServicesAll(docClient);
      const svc = allItems.find(i => i.serviceId === req.query.serviceId && i.serviceId !== '_schedule_');
      return res.json({ service: svc ?? null });
    }

    const allItems = await getDailyServicesAll(docClient);

    // '_schedule_' は日付→serviceId のスケジュール管理用アイテム（一般アイテムから除外）
    const scheduleItem = allItems.find(i => i.serviceId === '_schedule_');
    const items = allItems
      .filter(i => i.serviceId !== '_schedule_')
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (items.length === 0) return res.json({ service: null });

    // 今日の日付（JST）
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    // 再抽選（rerollSeed あり）のみユーザー別ハッシュで選択
    // 通常アクセスは userId の有無を問わず _schedule_ を使用し、
    // サービス追加後も当日のサービスが変わらないようにする
    if (req.query.userId && req.query.rerollSeed) {
      const str = req.query.userId + jstDate + req.query.rerollSeed;
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return res.json({ service: items[Math.abs(hash) % items.length] });
    }

    // userId がある場合、今日すでに解放済みかを確認（クロスデバイス同期用）
    let alreadyUnlocked = false;
    if (req.query.userId) {
      try {
        const encResult = await docClient.send(new GetCommand({
          TableName: 'EncyclopediaUnlocks',
          Key: { userId: req.query.userId },
        }));
        if (encResult.Item?.unlockDate === jstDate) alreadyUnlocked = true;
      } catch {}
    }

    // スケジュールにすでに今日の結果があればそれを返す
    const schedule = JSON.parse(scheduleItem?.schedule || '{}');
    if (schedule[jstDate]) {
      const locked = items.find(s => s.serviceId === schedule[jstDate]);
      if (locked) return res.json({ service: locked, alreadyUnlocked });
    }

    // まだ決まっていない → シャッフルキューから今日のサービスを確定して保存
    // キューを使うことで全サービスを偏りなく一巡してから繰り返す（300件なら300日周期）
    let queue = scheduleItem?.queue ? JSON.parse(scheduleItem.queue) : null;
    let pointer = scheduleItem?.pointer ?? 0;

    // キュー未生成 or 全件消化済み → 全サービスIDをシャッフルしてキューを再生成
    if (!queue || pointer >= queue.length) {
      queue = items.map(i => i.serviceId);
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      pointer = 0;
    }

    const todayId = queue[pointer];
    const service = items.find(i => i.serviceId === todayId) ?? items[0];
    schedule[jstDate] = service.serviceId;
    pointer++;

    // 古いエントリを削除（直近90日分のみ保持）
    const cutoff = new Date(Date.now() + 9 * 3600 * 1000 - 90 * 86400000).toISOString().slice(0, 10);
    for (const d of Object.keys(schedule)) {
      if (d < cutoff) delete schedule[d];
    }

    await docClient.send(new PutCommand({
      TableName: 'DailyServices',
      Item: {
        serviceId: '_schedule_',
        schedule: JSON.stringify(schedule),
        queue: JSON.stringify(queue),
        pointer,
      },
    }));

    res.json({ service, alreadyUnlocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：全件取得
app.get('/admin/daily-services', async (req, res) => {
  try {
    const docClient = getClient();
    const allItems = await getDailyServicesAll(docClient);
    const items = allItems
      .filter(i => i.serviceId !== '_schedule_')
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：追加
app.post('/admin/daily-services', async (req, res) => {
  try {
    const docClient = getClient();
    const { name, shortName, category, icon, description, trivia, docUrl, order, isActive } = req.body;
    if (!name || !description) return res.status(400).json({ error: 'name and description are required' });
    const serviceId = uuidv4();
    await docClient.send(new PutCommand({
      TableName: 'DailyServices',
      Item: {
        serviceId,
        name: name.trim(),
        shortName: (shortName || '').trim(),
        category: (category || '').trim(),
        icon: (icon || '☁️').trim(),
        description: description.trim(),
        trivia: (trivia || '').trim(),
        docUrl: (docUrl || '').trim(),
        order: Number(order) || 0,
        isActive: isActive !== false,
        createdAt: new Date().toISOString(),
      },
    }));
    _dailyServicesCache = null; // キャッシュ無効化
    res.json({ serviceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：更新
app.put('/admin/daily-services/:id', async (req, res) => {
  try {
    const docClient = getClient();
    const { name, shortName, category, icon, description, trivia, docUrl, order, isActive } = req.body;
    await docClient.send(new UpdateCommand({
      TableName: 'DailyServices',
      Key: { serviceId: req.params.id },
      UpdateExpression: 'SET #n = :name, shortName = :sn, category = :cat, icon = :icon, description = :desc, trivia = :tv, docUrl = :url, #o = :order, isActive = :active',
      ExpressionAttributeNames: { '#n': 'name', '#o': 'order' },
      ExpressionAttributeValues: {
        ':name': (name || '').trim(),
        ':sn': (shortName || '').trim(),
        ':cat': (category || '').trim(),
        ':icon': (icon || '☁️').trim(),
        ':desc': (description || '').trim(),
        ':tv': (trivia || '').trim(),
        ':url': (docUrl || '').trim(),
        ':order': Number(order) || 0,
        ':active': isActive !== false,
      },
    }));
    _dailyServicesCache = null; // キャッシュ無効化
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：削除
app.delete('/admin/daily-services/:id', async (req, res) => {
  try {
    const docClient = getClient();
    await docClient.send(new DeleteCommand({
      TableName: 'DailyServices',
      Key: { serviceId: req.params.id },
    }));
    _dailyServicesCache = null; // キャッシュ無効化
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── テーマ設定 ───────────────────────────────────────────────────────────────
app.get('/admin/settings/admins', async (req, res) => {
  try {
    const emails = await getAdminEmails();
    res.json({ emails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/admin/settings/admins', async (req, res) => {
  try {
    const docClient = getClient();
    const { emails } = req.body;
    if (!Array.isArray(emails)) return res.status(400).json({ error: 'emails must be an array' });
    const filtered = emails.map(e => String(e).trim().toLowerCase()).filter(e => e && e.includes('@'));
    await docClient.send(new PutCommand({
      TableName: 'AppSettings',
      Item: { settingId: 'admins', emails: JSON.stringify(filtered), updatedAt: new Date().toISOString() },
    }));
    res.json({ success: true, emails: filtered });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/settings/about', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({ TableName: 'AppSettings', Key: { settingId: 'about' } }));
    if (!result.Item) return res.json({ sections: {} });
    const sections = JSON.parse(result.Item.sections || '{}');
    res.json({ sections });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/admin/settings/about', requireAdmin, async (req, res) => {
  try {
    const docClient = getClient();
    const { sections } = req.body;
    if (!sections || typeof sections !== 'object') return res.status(400).json({ error: 'sections required' });
    await docClient.send(new PutCommand({
      TableName: 'AppSettings',
      Item: { settingId: 'about', sections: JSON.stringify(sections), updatedAt: new Date().toISOString() },
    }));
    res.json({ success: true, sections });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/settings/theme', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({ TableName: 'AppSettings', Key: { settingId: 'theme' } }));
    if (!result.Item) return res.json({ colors: {}, enabled: true });
    const colors = JSON.parse(result.Item.colors || '{}');
    const enabled = result.Item.enabled !== false; // default true
    res.json({ colors, enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/admin/settings/theme', requireAdmin, async (req, res) => {
  try {
    const docClient = getClient();
    const { colors, enabled } = req.body;
    if (!colors || typeof colors !== 'object') return res.status(400).json({ error: 'colors required' });
    await docClient.send(new PutCommand({
      TableName: 'AppSettings',
      Item: {
        settingId: 'theme',
        colors: JSON.stringify(colors),
        enabled: enabled !== false,
        updatedAt: new Date().toISOString(),
      },
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 合格コメント ──
app.get('/settings/pass-comments', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({ TableName: 'AppSettings', Key: { settingId: 'passComments' } }));
    if (!result.Item) return res.json({ comments: {} });
    res.json({ comments: JSON.parse(result.Item.comments || '{}') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/admin/pass-comments', requireAdmin, async (req, res) => {
  try {
    const docClient = getClient();
    const { examType, comment } = req.body;
    if (!examType) return res.status(400).json({ error: 'examType required' });
    const existing = await docClient.send(new GetCommand({ TableName: 'AppSettings', Key: { settingId: 'passComments' } }));
    const comments = JSON.parse(existing.Item?.comments || '{}');
    if (comment === null || comment === undefined || comment === '') {
      delete comments[examType];
    } else {
      comments[examType] = comment;
    }
    await docClient.send(new PutCommand({
      TableName: 'AppSettings',
      Item: { settingId: 'passComments', comments: JSON.stringify(comments), updatedAt: new Date().toISOString() },
    }));
    res.json({ success: true, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Encyclopedia unlocks sync ──
app.get('/users/me/encyclopedia-unlocks', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({
      TableName: 'EncyclopediaUnlocks',
      Key: { userId },
    }));
    if (!result.Item) return res.json({ unlocks: {}, unlockDate: null, todayServiceId: null, services: {} });

    const unlocks = JSON.parse(result.Item.unlocks || '{}');
    const serviceIds = Object.keys(unlocks).filter(id => id && id !== '_schedule_');

    // アンロック済みサービスの詳細データをバッチ取得（新デバイスでもアイコン表示できるよう）
    const services = {};
    for (let i = 0; i < serviceIds.length; i += 100) {
      const chunk = serviceIds.slice(i, i + 100).map(id => ({ serviceId: id }));
      try {
        const batch = await docClient.send(new BatchGetCommand({
          RequestItems: { DailyServices: { Keys: chunk } },
        }));
        for (const item of (batch.Responses?.DailyServices || [])) {
          services[item.serviceId] = item;
        }
      } catch (_) { /* バッチ取得失敗は非致命的 */ }
    }

    res.json({
      unlocks,
      unlockDate: result.Item.unlockDate || null,
      todayServiceId: result.Item.todayServiceId || null,
      services,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/users/me/encyclopedia-unlocks', async (req, res) => {
  try {
    const { userId, unlocks, unlockDate, todayServiceId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const docClient = getClient();
    await docClient.send(new PutCommand({
      TableName: 'EncyclopediaUnlocks',
      Item: {
        userId,
        unlocks: JSON.stringify(unlocks || {}),
        unlockDate: unlockDate || null,
        todayServiceId: todayServiceId || null,
        updatedAt: new Date().toISOString(),
      },
    }));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── ユーザーポイント ──

app.get('/users/me/points', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({
      TableName: 'UserPoints',
      Key: { userId },
    }));
    res.json({ points: result.Item?.points ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/users/me/points', async (req, res) => {
  try {
    const { userId, points } = req.body;
    if (!userId || points === undefined) return res.status(400).json({ error: 'userId and points required' });
    const safePoints = Math.max(0, Math.round(Number(points)));
    const docClient = getClient();
    await docClient.send(new PutCommand({
      TableName: 'UserPoints',
      Item: { userId, points: safePoints, updatedAt: new Date().toISOString() },
    }));
    res.json({ points: safePoints });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── ユーザー設定（目標資格などのデバイス間同期） ──

app.get('/users/me/preferences', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const docClient = getClient();
    const result = await docClient.send(new GetCommand({
      TableName: 'AppSettings',
      Key: { settingId: `userPrefs_${userId}` },
    }));
    res.json({
      targetExam: result.Item?.targetExam ?? null,
      examDates:  result.Item?.examDates  ?? {},
      dailyGoal:  result.Item?.dailyGoal  ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/users/me/preferences', async (req, res) => {
  try {
    const { userId, targetExam, examDates, dailyGoal } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const docClient = getClient();

    const sets = ['updatedAt = :now'];
    const names = {};
    const values = { ':now': new Date().toISOString() };

    if (targetExam !== undefined) {
      sets.push('#targetExam = :targetExam');
      names['#targetExam'] = 'targetExam';
      values[':targetExam'] = targetExam ?? null;
    }
    if (examDates !== undefined) {
      sets.push('#examDates = :examDates');
      names['#examDates'] = 'examDates';
      values[':examDates'] = examDates;
    }
    if (dailyGoal !== undefined) {
      sets.push('#dailyGoal = :dailyGoal');
      names['#dailyGoal'] = 'dailyGoal';
      values[':dailyGoal'] = dailyGoal;
    }

    await docClient.send(new UpdateCommand({
      TableName: 'AppSettings',
      Key: { settingId: `userPrefs_${userId}` },
      UpdateExpression: 'SET ' + sets.join(', '),
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
    }));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 管理者によるユーザーデータ削除 ──

const USER_POOL_ID = 'ap-northeast-1_KIOFciGhQ';

async function findCognitoUserByEmail(email) {
  const client = new CognitoIdentityProviderClient({ region: 'ap-northeast-1' });
  const result = await client.send(new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Filter: `email = "${email}"`,
    Limit: 1,
  }));
  const users = result.Users || [];
  if (users.length === 0) return null;
  const user = users[0];
  const sub = (user.Attributes || []).find(a => a.Name === 'sub')?.Value;
  return sub ? { userId: sub, username: user.Username } : null;
}


// ユーザーデータ削除の共通処理
async function executeUserDataDeletion(docClient, userId) {
  const deleteItems = async (table, keys) => {
    if (keys.length === 0) return;
    await Promise.all(keys.map(key => docClient.send(new DeleteCommand({ TableName: table, Key: key }))));
  };

  const [qsResult, tsResult, sessResult] = await Promise.all([
    docClient.send(new QueryCommand({
      TableName: 'UserQuestionStats',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'userId, questionId',
    })),
    docClient.send(new QueryCommand({
      TableName: 'UserTagStats',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'userId, tagId',
    })),
    docClient.send(new QueryCommand({
      TableName: 'Sessions',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'userId, sessionId',
    })),
  ]);

  await Promise.all([
    deleteItems('UserQuestionStats', (qsResult.Items || []).map(i => ({ userId: i.userId, questionId: i.questionId }))),
    deleteItems('UserTagStats', (tsResult.Items || []).map(i => ({ userId: i.userId, tagId: i.tagId }))),
  ]);

  const sessionIds = (sessResult.Items || []).map(s => s.sessionId);
  for (const sessionId of sessionIds) {
    let lastKey;
    do {
      const ansResult = await docClient.send(new QueryCommand({
        TableName: 'UserAnswers',
        KeyConditionExpression: 'userId = :uid AND begins_with(questionIdTimestamp, :prefix)',
        ExpressionAttributeValues: { ':uid': userId, ':prefix': `${sessionId}#` },
        ExclusiveStartKey: lastKey,
        ProjectionExpression: 'userId, questionIdTimestamp',
      }));
      await deleteItems('UserAnswers', (ansResult.Items || []).map(a => ({ userId: a.userId, questionIdTimestamp: a.questionIdTimestamp })));
      lastKey = ansResult.LastEvaluatedKey;
    } while (lastKey);
  }
  await deleteItems('Sessions', sessionIds.map(sid => ({ userId, sessionId: sid })));

  try { await docClient.send(new DeleteCommand({ TableName: 'EncyclopediaUnlocks', Key: { userId } })); } catch {}
  try { await docClient.send(new DeleteCommand({ TableName: 'UserPoints', Key: { userId } })); } catch {}

  const reportsResult = await docClient.send(new ScanCommand({
    TableName: 'Reports',
    FilterExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ProjectionExpression: 'reportId',
  }));
  await deleteItems('Reports', (reportsResult.Items || []).map(i => ({ reportId: i.reportId })));

  // クライアント側localStorageリセット用タイムスタンプ
  const resetAt = new Date().toISOString();
  await docClient.send(new PutCommand({
    TableName: 'AppSettings',
    Item: { settingId: `userReset_${userId}`, userId, resetAt },
  }));
}

// 管理者: メールアドレス指定で直接ユーザーデータを削除（admin認証のみで実行可能）
app.post('/admin/direct-delete', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const cognitoUser = await findCognitoUserByEmail(email);
    if (!cognitoUser) return res.status(404).json({ error: 'User not found' });

    const docClient = getClient();
    await executeUserDataDeletion(docClient, cognitoUser.userId);

    res.json({ success: true, userId: cognitoUser.userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = app;
