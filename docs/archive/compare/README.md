# アーカイブ: AWSサービス比較ページ（/compare）

2026-07-22 にアーカイブ。「アプリ本体からボタン導線のない独立SEOページは本筋から外れる」という判断で、
develop / 本番からは撤去した。将来復活させる場合のために、このブランチ `archive/compare-pages` に一式を保存する。

## このブランチに含まれるもの（develop から撤去した実装一式）
- フロント: `app/compare/[slug]/page.tsx`（比較表・使い分け・試験ポイント・構造化データ・内部リンク）、`app/compare/page.tsx`（一覧ハブ）
- Lambda 公開ルート: `lambda/src/app.js` の `GET /comparisons/public` と `GET /comparisons/item`
- 生成/検証スクリプト: `prompts/night-prompts/scripts/04b-generate-comparisons.sh` / `05b-check-comparisons.sh`
- トピックカタログ: `prompts/night-prompts/scripts/state/comparison-catalog.json`（12トピック）
- robots.txt の `Allow: /compare/`、sitemap の `/compare/*` 13URL
- **生成済みコンテンツ12件のエクスポート**: `docs/archive/compare/comparisons-content.json`（DynamoDB Comparisons テーブルの scan 結果。テーブル削除後もこれで内容を復元可能）

## 撤去したバックエンド（復活時に再構築が必要）
- DynamoDB テーブル `Comparisons`（PK=slug）→ 削除済み。復元は上記 JSON を put-item で流し込む。
- API Gateway `/comparisons` + `/comparisons/{proxy+}` リソース → 削除済み。
- Lambda 実行ロール `awsquizappLambdaRolee2ba0c1b-dev` の `extra-tables-access-policy` から Comparisons ARN を除去済み。

## 復活手順（概要）
1. このブランチを develop にマージ（またはファイルを取り込み）
2. `Comparisons` テーブル再作成 → `comparisons-content.json` を put-item で復元
3. API Gateway `/comparisons` リソース再作成 + Lambda 統合、IAM に Comparisons ARN 追加
4. Lambda を dev/prod デプロイ、フロントを push
