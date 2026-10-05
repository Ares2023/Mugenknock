# おひねり — 実装タスク

> 2026-10-05: 主要な要件を確定し、Lambda とフロントを実装（**公開前＝無効のまま**。`AppSettings.ohineri.enabled` を立てるまで利用者には何も出ない）。

## 要件確定

- [x] 未決事項 1〜5（ゲスト・アプリ版・模試と切り詰め・決済代行）に結論
- [x] 認証の方針（`/sessions`・`answers` はおひねり有効時だけトークンの sub を本人とする）
- [ ] 未決事項 6〜10（売り手情報・返金・副業規定・公開時期・名称）— **公開前に決める**

## 実装

- [x] `lambda/src/entitlements.js` ＋ テスト（JST 日付境界・残り数の切り詰め）
- [x] `lambda/src/ohineri.js` ＋ テスト（許可オリジン・支払い判定・冪等な保存・署名検証）
- [x] `app.js`: Webhook（生ボディ）・`/users/me/limits`・`checkout`・`checkout/confirm`・セッション開始の上限・回答時の日次加算
- [x] Webhook の疎通テスト（`lambda/test/webhook.test.js`。署名OK/NG/未払い）
- [x] フロント: `OhineriDialog`・`useOhineriGate`・Home（サクッと/しっかり対策）・Practice（演習）に組み込み。戻り先の確認は Home
- [x] プライバシーポリシー・利用規約の追記（返金方針を含む。2026-10-06）
- [ ] 特定商取引法に基づく表記ページ（**売り手情報の入力が要る**。公開前。返金は規約 第7条と同じ内容を書く）

## インフラ（人間の確認が要る）

- [x] DynamoDB テーブル作成: `UserEntitlements-{dev,prod}`（PK `userId`）、`UserDailyCounts-{dev,prod}`（PK `userId` / SK `date`、TTL `expiresAt`）
- [x] Lambda ロール `awsquizappLambdaRolee2ba0c1b-dev`（dev/prod 共用）に上記4テーブルの権限を追加
- [x] API Gateway に `/webhooks/{proxy+}` を追加して **dev ステージのみ**デプロイ（prod ステージは未デプロイ＝公開時に人間の確認のうえで）
- [x] Stripe アカウントのテストキー → dev Lambda の環境変数へ
- [x] Stripe ダッシュボードで Webhook エンドポイント（dev）を登録 → シークレットを環境変数へ

## 検証

- [x] dev でテストカード（4242…）の通し決済 → Webhook と confirm の両方で購入が反映される
- [x] 上限30問・残りへの切り詰め・翌日0時（JST）リセットの確認
- [ ] 旧フロント（上限を知らない）が 429 でも壊れず止まること（未確認。旧JSは429のとき sessionId が空になり回答が保存されない）

## 検証結果（2026-10-05・dev）

- 上限30問・模試は数えない・他人の userId を指定しても自分の回数だけ増える・上限後の通常演習は 429・模試とゲストは 200
- Stripe テストカードで決済 → **Webhook だけで**購入が記録され `unlimited` になる（confirm 前）。confirm は冪等、再購入は 409
- 画面（ローカル＋dev Lambda）: `/users/me/limits` が呼ばれ、上限案内ダイアログが最前面に出る
- 検証後に元へ戻した: `AppSettings.ohineri.enabled=false`、テスト用の購入・日次カウントを削除

## 公開（**必ず人間に確認**）

- [ ] prod Lambda にコードをデプロイ（`deploy-lambda.sh prod`）。決済キーが無い間は有効にならない
- [ ] prod ステージへ API Gateway をデプロイ（`/webhooks/{proxy+}`）
- [ ] 本番の Webhook エンドポイント登録

- [ ] 本番キー・本番 Webhook の登録
- [ ] `AppSettings.ohineri.enabled = true`
- [ ] 自分で実決済1件 → 反映確認 → 返金

## クローズ

- [ ] `docs/05-screens.md` に画面を反映、spec を「完了」に
