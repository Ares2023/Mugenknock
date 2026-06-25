const ADMIN_EMAIL = 'mugenknock@gmail.com';

// ドメイン定義は単一マスタ examDomains.json から導出（フロントの src/data/examDomains.json と同一。
// デプロイ時に deploy-lambda.sh が master を lambda/src/ へ同期する）。
// 配列 index = ドメインの正準キー。
const EXAM_DOMAINS_MASTER = require('./examDomains.json');

const EXAM_DOMAINS = Object.fromEntries(
  Object.entries(EXAM_DOMAINS_MASTER).map(([exam, doms]) => [exam, doms.map(d => d.ja)])
);

module.exports = { ADMIN_EMAIL, EXAM_DOMAINS, EXAM_DOMAINS_MASTER };
