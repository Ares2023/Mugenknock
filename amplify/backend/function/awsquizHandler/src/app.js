const express = require('express');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
app.use(express.json());

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

// シャッフル関数
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 問題一覧取得
app.get('/questions', async (req, res) => {
  try {
    const { examType, tagId, limit, shuffle: doShuffle } = req.query;

    let items = [];

    if (tagId) {
      // タグで絞り込む場合はQuestionTagRelationsを経由
      const relResult = await docClient.send(new QueryCommand({
        TableName: 'QuestionTagRelations',
        KeyConditionExpression: 'tagId = :tagId',
        ExpressionAttributeValues: { ':tagId': tagId }
      }));
      const questionIds = relResult.Items.map(i => i.questionId);

      // 各questionIdで問題を取得
      const promises = questionIds.map(qid =>
        docClient.send(new GetCommand({ TableName: 'Questions', Key: { questionId: qid } }))
      );
      const results = await Promise.all(promises);
      items = results.map(r => r.Item).filter(Boolean);

    } else if (examType) {
      // 試験種別で絞り込む
      const result = await docClient.send(new QueryCommand({
        TableName: 'Questions',
        IndexName: 'examType-index',
        KeyConditionExpression: 'examType = :examType',
        ExpressionAttributeValues: { ':examType': examType }
      }));
      items = result.Items;

    } else {
      // 全件取得
      const result = await docClient.send(new ScanCommand({ TableName: 'Questions' }));
      items = result.Items;
    }

    // シャッフル
    if (doShuffle === 'true') {
      items = shuffle(items);
    }

    // 件数制限
    if (limit) {
      items = items.slice(0, parseInt(limit));
    }

    // 正解・解説を除いて返す（一覧では不要）
    const sanitized = items.map(({ correctAnswers, explanation, ...rest }) => rest);

    res.json({ items: sanitized, count: sanitized.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 問題1件取得（正解・解説含む）
app.get('/questions/:id', async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: 'Questions',
      Key: { questionId: req.params.id }
    }));
    if (!result.Item) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(result.Item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;
