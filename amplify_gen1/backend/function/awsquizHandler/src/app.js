const express = require('express');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, QueryCommand, PutCommand, UpdateCommand, TransactWriteCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { v4: uuidv4 } = require('uuid');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { ADMIN_EMAIL, EXAM_DOMAINS } = require('./constants');

const app = express();
app.use(express.json());

const getClient = () => {
  const client = new DynamoDBClient({ region: 'ap-northeast-1' });
  return DynamoDBDocumentClient.from(client);
};

// ── CORS（localhost + Amplify Hosting + 本番ドメイン許可） ──
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://www.mugenknock.com',
  'https://mugenknock.com',
];
const AMPLIFY_ORIGIN_RE = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*\.amplifyapp\.com$/;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || AMPLIFY_ORIGIN_RE.test(origin))) {
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
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 問題生成・チェック状況（日次/月次集計）
app.get('/questions/growth-stats', async (req, res) => {
  try {
    const docClient = getClient();
    const items = await scanAll(docClient, {
      TableName: 'Questions',
      ProjectionExpression: 'createdAt, validityCheckedAt',
    });

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
      items = await queryAll(docClient, {
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :examType',
        ExpressionAttributeValues: { ':examType': examType }
      });
    } else {
      items = await scanAll(docClient, { TableName: 'Questions' });
    }

    if (domain) {
      const domainList = domain.split(',').map(d => d.trim()).filter(Boolean);
      items = items.filter(q => (q.tags || []).some(t => domainList.includes(t)));
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
          (q.tags || []).some(t => t.toLowerCase().includes(kw)) ||
          q.questionId.toLowerCase().includes(kw)
        )
      );
    }

    items = items.filter(q => !q.isHidden);
    if (doShuffle === 'true') items = shuffle(items);
    const total = items.length;
    if (offset) items = items.slice(parseInt(offset));
    if (limit) items = items.slice(0, parseInt(limit));
    const withAnswers = req.query.withAnswers === 'true';
    const sanitized = withAnswers
      ? items.map(item => ({
          ...item,
          correctAnswerCount: Array.isArray(item.correctAnswers) ? item.correctAnswers.length : 1,
        }))
      : items.map(({ correctAnswers, explanation, explanationEn, ...rest }) => ({
          ...rest,
          correctAnswerCount: Array.isArray(correctAnswers) ? correctAnswers.length : 1,
        }));
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
    res.json(result.Item);
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
    const { examType, domain, tags, questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'questions must be a non-empty array' });
    }

    const now = new Date().toISOString();
    const created = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const itemExamType = q.examType || examType;
      const itemDomain = q.domain || domain || null;
      const shortId = uuidv4().replace(/-/g, '').slice(0, 8);
      const questionId = `${itemExamType.toLowerCase()}-${shortId}`;
      const itemTags = Array.from(new Set([...(tags || []), ...(q.tags || [])]));

      const item = {
        questionId,
        examType: itemExamType,
        questionText: q.questionText,
        choices: q.choices,
        correctAnswers: q.correctAnswers,
        explanation: q.explanation || '',
        tags: itemTags,
        isMultiple: q.isMultiple ?? false,
        createdAt: now,
      };
      if (itemDomain) item.domain = itemDomain;
      if (q.questionTextEn) item.questionTextEn = q.questionTextEn;
      if (q.choicesEn && q.choicesEn.length > 0) item.choicesEn = q.choicesEn;
      if (q.explanationEn) item.explanationEn = q.explanationEn;

      await docClient.send(new PutCommand({ TableName: 'Questions', Item: item }));

      if (itemTags.length > 0) {
        await Promise.all(itemTags.map(tagId =>
          docClient.send(new PutCommand({
            TableName: 'QuestionTagRelations',
            Item: { tagId, questionId }
          }))
        ));
      }

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
    const { questionText, questionTextEn, choices, choicesEn, correctAnswers, explanation, explanationEn, domain, tags, isMultiple, examType } = req.body;

    // タグ関係を再構築（既存削除→新規挿入）
    const relResult = await docClient.send(new ScanCommand({
      TableName: 'QuestionTagRelations',
      FilterExpression: 'questionId = :qid',
      ExpressionAttributeValues: { ':qid': questionId }
    }));
    await Promise.all((relResult.Items || []).map(item =>
      docClient.send(new DeleteCommand({
        TableName: 'QuestionTagRelations',
        Key: { tagId: item.tagId, questionId: item.questionId }
      }))
    ));
    if (tags && tags.length > 0) {
      await Promise.all(tags.map(tagId =>
        docClient.send(new PutCommand({
          TableName: 'QuestionTagRelations',
          Item: { tagId, questionId }
        }))
      ));
    }

    const setParts = ['questionText = :qt', 'choices = :ch', 'correctAnswers = :ca', 'explanation = :ex', '#d = :d', 'tags = :t', 'isMultiple = :im', 'examType = :et', 'updatedAt = :ua'];
    const removeParts = [];
    const exprNames = { '#d': 'domain' };
    const exprValues = {
      ':qt': questionText,
      ':ch': choices,
      ':ca': correctAnswers,
      ':ex': explanation || '',
      ':d': domain || '',
      ':t': tags || [],
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
    const items = await scanAll(docClient, {
      TableName: 'Questions',
      ProjectionExpression: 'examType, tags, isHidden, validityCheckedAt, formatCheckedAt',
    });
    const visible = items.filter(i => !i.isHidden);
    const examCounts = {};
    const domainCounts = {};
    for (const item of visible) {
      const { examType, tags = [] } = item;
      examCounts[examType] = (examCounts[examType] || 0) + 1;
      if (!domainCounts[examType]) domainCounts[examType] = {};
      for (const tag of tags) {
        domainCounts[examType][tag] = (domainCounts[examType][tag] || 0) + 1;
      }
    }
    const validityCheckedCount = visible.filter(i => i.validityCheckedAt).length;
    const formatCheckedCount   = visible.filter(i => i.formatCheckedAt).length;
    res.json({ examCounts, domainCounts, totalCount: visible.length, validityCheckedCount, formatCheckedCount });
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
    scanParams.ProjectionExpression = 'questionId, examType, questionText, choices, correctAnswers, explanation, #dom, tags, isMultiple, validityCheckedAt, formatCheckedAt, validityEditLog, isHidden, validityRating, validityNote, fixProposalJson';
    scanParams.ExpressionAttributeNames = { '#dom': 'domain' };

    const [checkedItems, allItems] = await Promise.all([
      scanAll(docClient, scanParams),
      scanAll(docClient, { TableName: 'Questions', ProjectionExpression: 'questionId' }),
    ]);

    const items = checkedItems.sort((a, b) => (a.validityRating || 9) - (b.validityRating || 9));
    res.json({ items, count: items.length, totalCount: allItems.length });
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
        ProjectionExpression: 'questionId, examType, questionText, choices, correctAnswers, correctAnswerIndices, tags, isMultiple, isHidden, createdAt, updatedAt, validityCheckedAt, formatCheckedAt',
      });
    }

    if (tag) items = items.filter(q => (q.tags || []).includes(tag));
    if (domain) {
      const domainList = domain.split(',').map(d => d.trim()).filter(Boolean);
      items = items.filter(q => (q.tags || []).some(t => domainList.includes(t)));
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

// タグ一覧取得（examTypeで絞り込み可能）
app.get('/tags', async (req, res) => {
  try {
    const docClient = getClient();
    const { examType } = req.query;
    let items = [];

    if (examType) {
      items = await queryAll(docClient, {
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :examType',
        ExpressionAttributeValues: { ':examType': examType },
        ProjectionExpression: 'tags'
      });
    } else {
      items = await scanAll(docClient, {
        TableName: 'Questions',
        ProjectionExpression: 'tags'
      });
    }

    const tagSet = new Set();
    items.forEach(q => (q.tags || []).forEach(t => tagSet.add(t)));
    const tags = Array.from(tagSet).sort();
    res.json({ tags });
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
app.delete('/admin/reports/:id', async (req, res) => {
  try {
    const docClient = getClient();
    await docClient.send(new DeleteCommand({
      TableName: 'Reports',
      Key: { reportId: req.params.id }
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
app.get('/sessions/active', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.query;
    const result = await docClient.send(new QueryCommand({
      TableName: 'Sessions',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':userId': userId, ':active': 'active' }
    }));
    const active = result.Items && result.Items.length > 0 ? result.Items[0] : null;
    res.json({ session: active });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// セッション進捗取得
app.get('/sessions/:id/progress', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId } = req.query;
    const sessionResult = await docClient.send(new GetCommand({
      TableName: 'Sessions',
      Key: { userId, sessionId: req.params.id }
    }));
    if (!sessionResult.Item) return res.status(404).json({ error: 'Session not found' });

    const answersResult = await docClient.send(new QueryCommand({
      TableName: 'UserAnswers',
      KeyConditionExpression: 'userId = :userId AND begins_with(questionIdTimestamp, :prefix)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':prefix': req.params.id + '#'
      }
    }));
    res.json({ session: sessionResult.Item, answers: answersResult.Items || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 回答記録
app.post('/sessions/:id/answers', async (req, res) => {
  try {
    const docClient = getClient();
    const { userId, questionId, selectedAnswers, isCorrect, tags } = req.body;
    const now = new Date().toISOString();
    const questionIdTimestamp = `${req.params.id}#${questionId}#${now}`;

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

    if (tags && tags.length > 0) {
      tags.forEach(tagId => {
        transactItems.push({
          Update: {
            TableName: 'UserTagStats',
            Key: { userId, tagId },
            UpdateExpression: isCorrect
              ? 'ADD correctCount :one'
              : 'ADD incorrectCount :one',
            ExpressionAttributeValues: { ':one': 1 }
          }
        });
      });
    }

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
          ProjectionExpression: 'questionId, questionText, tags',
        })).then(r => r.Item).catch(() => null)
      )
    );
    const qMap = Object.fromEntries(questions.filter(Boolean).map(q => [q.questionId, q]));

    const result = answers
      .map(a => ({
        questionId: a.questionId,
        questionText: qMap[a.questionId]?.questionText ?? '',
        tags: qMap[a.questionId]?.tags ?? [],
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
    const { userId, status, score, isPassed } = req.body;
    await docClient.send(new UpdateCommand({
      TableName: 'Sessions',
      Key: { userId, sessionId: req.params.id },
      UpdateExpression: 'SET #s = :status, score = :score, isPassed = :isPassed, endedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':score': score,
        ':isPassed': isPassed,
        ':now': new Date().toISOString()
      }
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

    const [questionsResult, statsResult] = await Promise.all([
      docClient.send(new QueryCommand({
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :et',
        ExpressionAttributeValues: { ':et': examType },
        ProjectionExpression: 'questionId'
      })),
      docClient.send(new QueryCommand({
        TableName: 'UserQuestionStats',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId }
      }))
    ]);

    const examQuestionIds = new Set((questionsResult.Items || []).map(q => q.questionId));
    const answeredCount = (statsResult.Items || []).filter(s => examQuestionIds.has(s.questionId)).length;

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

    let questionIds = (statsResult.Items || [])
      .filter(s => (s.incorrectCount ?? 0) > 0)
      .map(s => s.questionId);

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
    const result = await docClient.send(new ScanCommand({ TableName: 'DailyServices' }));
    const allItems = result.Items || [];

    // '_schedule_' は日付→serviceId のスケジュール管理用アイテム（一般アイテムから除外）
    const scheduleItem = allItems.find(i => i.serviceId === '_schedule_');
    const items = allItems
      .filter(i => i.serviceId !== '_schedule_')
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (items.length === 0) return res.json({ service: null });

    // 今日の日付（JST）
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    // userIdが指定された場合はユーザー別のハッシュで決定（スケジュール不使用）
    if (req.query.userId) {
      const seed = req.query.rerollSeed || '';
      const str = req.query.userId + jstDate + seed;
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return res.json({ service: items[Math.abs(hash) % items.length] });
    }

    // スケジュールにすでに今日の結果があればそれを返す
    const schedule = JSON.parse(scheduleItem?.schedule || '{}');
    if (schedule[jstDate]) {
      const locked = items.find(s => s.serviceId === schedule[jstDate]);
      if (locked) return res.json({ service: locked });
    }

    // まだ決まっていない → 今日の index を確定してスケジュールに保存
    const jstDay = Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);
    const service = items[jstDay % items.length];
    schedule[jstDate] = service.serviceId;

    // 古いエントリを削除（直近90日分のみ保持）
    const cutoff = new Date(Date.now() + 9 * 3600 * 1000 - 90 * 86400000).toISOString().slice(0, 10);
    for (const d of Object.keys(schedule)) {
      if (d < cutoff) delete schedule[d];
    }

    await docClient.send(new PutCommand({
      TableName: 'DailyServices',
      Item: { serviceId: '_schedule_', schedule: JSON.stringify(schedule) },
    }));

    res.json({ service });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 管理者用：全件取得
app.get('/admin/daily-services', async (req, res) => {
  try {
    const docClient = getClient();
    const result = await docClient.send(new ScanCommand({ TableName: 'DailyServices' }));
    const items = (result.Items || [])
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
    if (!result.Item) return res.json({ unlocks: {}, unlockDate: null, todayServiceId: null });
    res.json({
      unlocks: JSON.parse(result.Item.unlocks || '{}'),
      unlockDate: result.Item.unlockDate || null,
      todayServiceId: result.Item.todayServiceId || null,
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

// ── 管理者によるユーザーデータ削除（確認メール付き） ──

const USER_POOL_ID = 'ap-northeast-1_KIOFciGhQ';
const SITE_URL = 'https://www.mugenknock.com';
const DEL_REQ_PREFIX = 'delReq_';
const DEL_AUTH_PREFIX = 'delAuth_';
const DEL_REQ_TTL_MS = 24 * 60 * 60 * 1000;

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

async function sendDeletionConfirmEmail(toEmail, token) {
  const sesClient = new SESClient({ region: 'ap-northeast-1' });
  const confirmUrl = `${SITE_URL}/confirm-delete?token=${token}`;
  await sesClient.send(new SendEmailCommand({
    Source: ADMIN_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: '【MugenKnock】データ削除の確認', Charset: 'UTF-8' },
      Body: {
        Text: {
          Data: `データ削除リクエストを受信しました。\n\n以下のリンクをクリックして削除を承認してください（24時間有効）：\n\n${confirmUrl}\n\n心当たりがない場合は、このメールを無視してください。`,
          Charset: 'UTF-8',
        },
      },
    },
  }));
}

// 管理者: 削除リクエスト作成 → 確認メール送信（既に永続認証済みならメール不要）
app.post('/admin/deletion-requests', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const cognitoUser = await findCognitoUserByEmail(email);
    if (!cognitoUser) return res.status(404).json({ error: 'User not found' });

    const docClient = getClient();

    // 永続認証レコードが存在すればメール不要
    const authResult = await docClient.send(new GetCommand({
      TableName: 'AppSettings',
      Key: { settingId: `${DEL_AUTH_PREFIX}${cognitoUser.userId}` },
    }));
    if (authResult.Item) {
      return res.json({ success: true, userId: cognitoUser.userId, preAuthorized: true });
    }

    const token = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + DEL_REQ_TTL_MS).toISOString();

    // 既存の一時リクエストを削除
    const existing = await docClient.send(new ScanCommand({
      TableName: 'AppSettings',
      FilterExpression: 'begins_with(settingId, :prefix) AND #em = :email',
      ExpressionAttributeNames: { '#em': 'email' },
      ExpressionAttributeValues: { ':prefix': DEL_REQ_PREFIX, ':email': email },
    }));
    for (const item of (existing.Items || [])) {
      await docClient.send(new DeleteCommand({ TableName: 'AppSettings', Key: { settingId: item.settingId } }));
    }

    await docClient.send(new PutCommand({
      TableName: 'AppSettings',
      Item: { settingId: `${DEL_REQ_PREFIX}${token}`, userId: cognitoUser.userId, email, confirmedAt: null, createdAt: now, expiresAt },
    }));

    await sendDeletionConfirmEmail(email, token);

    res.json({ success: true, userId: cognitoUser.userId });
  } catch (err) {
    console.error(err);
    const msg = String(err.message || err);
    if (msg.includes('not verified') || msg.includes('MessageRejected')) {
      return res.status(503).json({ error: `送信先メールアドレス（${req.body.email}）がSESで未検証です。SES本番アクセスへの移行、またはSESコンソールで対象アドレスを検証してください。` });
    }
    res.status(500).json({ error: msg });
  }
});

// 管理者: 削除リクエストの状態確認
app.get('/admin/deletion-requests/status', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });

    const cognitoUser = await findCognitoUserByEmail(email);
    if (!cognitoUser) return res.json({ status: 'none' });

    const docClient = getClient();

    // 永続認証レコードを優先チェック
    const authResult = await docClient.send(new GetCommand({
      TableName: 'AppSettings',
      Key: { settingId: `${DEL_AUTH_PREFIX}${cognitoUser.userId}` },
    }));
    if (authResult.Item) {
      return res.json({
        status: 'pre-authorized',
        userId: cognitoUser.userId,
        authorizedAt: authResult.Item.authorizedAt,
      });
    }

    // 一時リクエストを確認
    const scanResult = await docClient.send(new ScanCommand({
      TableName: 'AppSettings',
      FilterExpression: 'begins_with(settingId, :prefix) AND #em = :email',
      ExpressionAttributeNames: { '#em': 'email' },
      ExpressionAttributeValues: { ':prefix': DEL_REQ_PREFIX, ':email': email },
    }));
    const items = (scanResult.Items || []).filter(i => new Date(i.expiresAt) > new Date());
    if (items.length === 0) return res.json({ status: 'none' });
    const item = items[0];
    res.json({
      status: item.confirmedAt ? 'confirmed' : 'pending',
      token: item.settingId.replace(DEL_REQ_PREFIX, ''),
      userId: item.userId,
      confirmedAt: item.confirmedAt || null,
      expiresAt: item.expiresAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

// 管理者: データ削除実行
app.post('/admin/deletion-requests/execute', async (req, res) => {
  try {
    const { token, userId: directUserId, email: directEmail } = req.body;
    if (!token && !directUserId) return res.status(400).json({ error: 'token or userId required' });

    const docClient = getClient();
    let userId;
    let tokenSettingId = null;
    let email = directEmail || null;

    if (directUserId) {
      // pre-authorized パス: delAuth_ レコードで検証
      const authResult = await docClient.send(new GetCommand({
        TableName: 'AppSettings',
        Key: { settingId: `${DEL_AUTH_PREFIX}${directUserId}` },
      }));
      if (!authResult.Item) return res.status(403).json({ error: 'Not authorized' });
      userId = directUserId;
      email = email || authResult.Item.email;
    } else {
      // 通常パス: 一時トークンで検証
      const reqResult = await docClient.send(new GetCommand({
        TableName: 'AppSettings',
        Key: { settingId: `${DEL_REQ_PREFIX}${token}` },
      }));
      if (!reqResult.Item) return res.status(404).json({ error: 'Request not found' });
      if (!reqResult.Item.confirmedAt) return res.status(403).json({ error: 'Not confirmed yet' });
      if (new Date(reqResult.Item.expiresAt) < new Date()) return res.status(410).json({ error: 'Token expired' });
      userId = reqResult.Item.userId;
      email = email || reqResult.Item.email;
      tokenSettingId = `${DEL_REQ_PREFIX}${token}`;
    }

    await executeUserDataDeletion(docClient, userId);

    // 永続認証レコードを保存（なければ作成）
    await docClient.send(new PutCommand({
      TableName: 'AppSettings',
      Item: { settingId: `${DEL_AUTH_PREFIX}${userId}`, userId, email, authorizedAt: new Date().toISOString() },
      ConditionExpression: 'attribute_not_exists(settingId)',
    })).catch(() => {});

    // 一時トークンを削除
    if (tokenSettingId) {
      await docClient.send(new DeleteCommand({ TableName: 'AppSettings', Key: { settingId: tokenSettingId } }));
    }

    res.json({ success: true, userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// 公開: 確認リンク（メールからアクセス）
app.get('/confirm-delete', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token required' });

    const docClient = getClient();
    const result = await docClient.send(new GetCommand({
      TableName: 'AppSettings',
      Key: { settingId: `${DEL_REQ_PREFIX}${token}` },
    }));
    if (!result.Item) return res.status(404).json({ error: 'Invalid or expired token' });
    if (new Date(result.Item.expiresAt) < new Date()) return res.status(410).json({ error: 'Token expired' });
    if (result.Item.confirmedAt) return res.json({ success: true, alreadyConfirmed: true, email: result.Item.email });

    const now = new Date().toISOString();
    await docClient.send(new UpdateCommand({
      TableName: 'AppSettings',
      Key: { settingId: `${DEL_REQ_PREFIX}${token}` },
      UpdateExpression: 'SET confirmedAt = :now',
      ExpressionAttributeValues: { ':now': now },
    }));

    // 永続認証レコードを保存
    await docClient.send(new PutCommand({
      TableName: 'AppSettings',
      Item: { settingId: `${DEL_AUTH_PREFIX}${result.Item.userId}`, userId: result.Item.userId, email: result.Item.email, authorizedAt: now },
      ConditionExpression: 'attribute_not_exists(settingId)',
    })).catch(() => {});

    res.json({ success: true, email: result.Item.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;
