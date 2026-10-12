# おひねり（1日の演習上限と、100円での撤廃） — 設計（下書き）

`spec.md` の要件を満たす実装方針。**要件が確定するまでは、ここも暫定。**

## 参照した既存仕様

- `docs/03-domain-model.md` §3.1 — テーブル一覧。ユーザー系6テーブルは `-dev`/`-prod` に分離（`SPLIT_TABLES`）
- `lambda/src/app.js` を実読して確認した事実（docs ではなくコード）:
  - `/users/me/*` は `requireUser`（Cognito idToken を検証し userId を sub で上書き）で保護されている
  - **`POST /sessions` と `POST /sessions/:id/answers` は認証されていない**（body の userId を信用）
  - `express.json()` が全ルートに掛かっている（L30）。Lambda は `aws-serverless-express` 経由（`index.js`）
  - 回答の記録は `UserAnswers` + `UserQuestionStats` のトランザクション（L1348〜）
- `CLAUDE.md` — ゲスト/ログイン境界、デプロイ規約。**検証(develop preview)のフロントは /prod Lambda を叩く**

## アプローチ

### 全体像

```
[演習開始]  ──(1)残り回数を確認──▶ Lambda ──▶ 日次カウント + 購入状態
   │ 残りがあれば、出題数を「残り」以内に絞って開始
[回答]      ──(2)回答を記録──────▶ Lambda ──▶ 日次カウントを +1（原子的）
[購入]      ──(3)購入ボタン──────▶ Lambda ──▶ 決済代行の「決済ページ」を作成 → 利用者が遷移して支払い
決済代行    ──(4)決済完了の通知（Webhook）▶ Lambda ──▶ 署名を検証 → 購入状態を保存
[戻り]      ──(5)購入状態を再取得 → 上限表示を消す
```

**購入の事実は(4)のWebhookだけが書く。** 画面側の「成功ページに戻った」は信用しない
（URL を直接開いて偽装できるため）。

### 決済代行の候補

| 案 | 長所 | 短所 |
|---|---|---|
| **Stripe Checkout（推奨）** | 日本円100円に対応。決済画面は Stripe 側でカード情報を自前で扱わない。テストモードがあり本番と同じ流れを無料で試せる。ドキュメントと Node.js SDK が充実 | 手数料は決済額の約3.6%（要確認）。最低決済額あり（JPYは50円、要確認） |
| Stripe Payment Link | コードがほぼ要らない（URL を貼るだけ） | 「誰が払ったか」を結びつけにくい（`client_reference_id` は使えるが生成が静的）。**決済システムを実装して試す目的に合わない** |
| PayPal / Square | 利用者が多い | 実装・審査の手間が増える。今回の目的に対して過剰 |
| Apple / Google のアプリ内課金 | アプリ版で必須の手段 | 今回はアプリ版を対象外にしたので不要（spec 未決事項2） |

推奨は Stripe Checkout（`mode=payment`、1回払い）。

### 認証の扱い（重要）

- 購入・上限確認は `/users/me/*` 配下に置く（`requireUser` で sub を確定）。決済の `client_reference_id`
  にその sub を入れ、Webhook で「誰の購入か」を復元する
- **回答の上限を厳密に効かせるなら `POST /sessions` と `POST /sessions/:id/answers` にも認証が要る。**
  現状は他人の userId を指定できるため、他人の日次カウントを増やして上限に到達させる嫌がらせが可能になる。
  - 案A: 両方を `/users/me/` 配下へ移す／認証を足す（フロントのデプロイ済み旧JSとの互換を要検討）
  - 案B: 日次カウントを「回答記録」ではなく「演習開始時に認証付きで取る出題トークン」に紐づけ、厳密さは求めない
  - **採用（2026-10-05）**: 案Aの最小版。おひねりが有効なときだけ、有効なトークンの sub を本人とする（無い・無効ならゲスト扱いで従来どおり）。フロントは既に全APIへ Authorization を付けている（`apiAuth.ts`）ので変更不要

### 上限の数え方（暫定）

- 日次カウント: キー `userId` ＋ `date`（JST の `YYYY-MM-DD`）、値 `count`。回答記録のトランザクションに
  `ADD count 1` を足して**原子的に**加算する。古い日付は TTL で消す（累積を溜めない）
- 判定は**演習開始時**（`POST /sessions` またはその直前の確認API）。`残り = 30 − count`。
  残りが 0 なら開始不可、出題数が残りを超えるなら**残り数に切り詰める**
  → 途中で止まらず、合計もちょうど30問に収まる（spec R4 の案）
- 購入済みなら判定をスキップ（カウントは続けてよい。統計に使えるが今回は使わない）

### 購入状態の保存

- 新規テーブル `UserEntitlements`（PK `userId`、`ohineri: true`、`purchasedAt`、`stripeSessionId`、`amount`）を
  `SPLIT_TABLES` に追加して `-dev`/`-prod` に分離する。TTL なし（決済記録）
- **冪等性**: Webhook は同じ通知が複数回届きうる。`stripeSessionId` を条件付き書き込み
  （`attribute_not_exists`）で保存し、二重記録を防ぐ
- 購入状態は `GET /users/me/entitlements`（または上限確認APIに同梱）で返す

### Webhook の実装上の注意

- 署名検証は**生のリクエストボディ**が必要。`express.json()` が全ルートに掛かっているので、
  `/webhooks/stripe` を `express.json()` より**前**に `express.raw({ type: 'application/json' })` で登録する
- `aws-serverless-express` 経由で base64 のボディが来ても生のバイト列を復元できるか、dev で実測する
- 対象イベントは `checkout.session.completed` のみ（`payment_status === 'paid'` を確認）
- Webhook は認証なしの公開エンドポイントになる。**署名検証が唯一の防御**なので、検証失敗は 400 で即終了。
  署名シークレットは環境ごとに別（テスト/本番）
- API Gateway `a0q3656qw4` に `/webhooks` と `/webhooks/{proxy+}`（ANY・Lambda プロキシ統合・認証なし）を足してステージへデプロイする（2026-10-05 確認: 未作成）

### 秘密情報とキー管理

- Stripe のシークレットキー・Webhook シークレットはコードやリポジトリに置かず、**Lambda の環境変数**
  （`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`）に入れる。dev/prod は別関数なので環境ごとにキーを分けられる。
  （当初は SSM Parameter Store を推奨していたが、Lambda ロールに SSM の権限を足す必要があり、
  個人運営の規模では環境変数で足りるため変更。`deploy-lambda.sh` はコードだけを更新し環境変数を上書きしない）
- **環境の落とし穴**: 検証(develop preview)のフロントは `/prod` Lambda を叩く（CLAUDE.md）。
  → 「prod Lambda にもまずテストキーを入れて動作確認 → 公開時にだけ本番キーへ差し替え」の順にする。
  本番キーへの差し替え、本番 Webhook の登録、`AppSettings.ohineri.enabled` を true にすることは**必ず人間に確認してから**行う
- **`AppSettings` は dev/prod 共有**。`ohineri.enabled` を true にすると、キーが入っている Lambda すべてで有効になる
  （キーが無い Lambda は有効にならない）。テスト中は dev だけにキーを入れ、prod はキー無し＝無効のままにできる
- 日次カウント・購入状態のテーブルは dev/prod 分離。テスト購入が本番の購入状態を汚さない

### 却下した案

| 案 | 却下理由 |
|---|---|
| 画面側で「決済成功ページに戻った」ことを購入の根拠にする | URL を直接開くだけで偽装できる |
| ブラウザ(localStorage)に回答数を持つ | ゲスト/ログイン境界の原則違反。端末をまたいで同期されない |
| 購入状態を Cognito のカスタム属性に持つ | 属性の更新に管理者権限が要り、トークンの更新タイミングも絡む。DynamoDB で足りる |
| 月額・複数段階の価格 | 今回の目的（決済の流れを一通り試す）を超える |

## 変更するファイル（見込み）

| ファイル | 変更内容 |
|---|---|
| `lambda/src/app.js` | `/webhooks/stripe`、決済セッション作成、上限確認、日次カウント加算、購入状態取得。`SPLIT_TABLES` に追加 |
| `lambda/src/entitlements.js`（新規） | 上限判定・日次キー（JST）の純粋関数。単体テスト可能にする（`selection.js` と同じ方針） |
| `lambda/test/entitlements.test.js`（新規） | 日付境界（JST 0:00）、残り数の切り詰め、購入済みの素通しを検証 |
| `src/views/Home.tsx` ほか演習開始の導線 | 残り問題数の表示、上限到達の案内、購入ボタン |
| `app/…/page.tsx` + `src/views/` | 特定商取引法に基づく表記ページ、購入完了/キャンセルの戻りページ |
| `src/views/About.tsx` / `app/privacy-policy/page.tsx` | 決済代行への個人情報提供の記載を追記 |
| `docs/03・04・05・06` | 反映（完了時） |

## データモデルの変更

| テーブル | 属性 | 型 | 既存データの扱い |
|---|---|---|---|
| `UserEntitlements{-env}`（新規） | `userId`(PK) / `ohineri` / `purchasedAt` / `stripeSessionId` / `amount` | S / BOOL / S / S / N | 新規のため移行なし |
| `UserDailyCounts{-env}`（新規） | `userId`(PK) / `date`(SK, JST) / `count` / `ttl` | S / S / N / N | 新規のため移行なし |

**既存データの移行が必要か**: いいえ

## API の変更

| メソッド | パス | 認証 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/users/me/limits` | ログイン | — | `{ limit: 30, used, remaining, unlimited }` |
| POST | `/users/me/checkout` | ログイン | — | `{ url }`（Stripe の決済ページ） |
| POST | `/users/me/checkout/confirm` | ログイン | `{ sessionId }` | `limits`（Stripe API で支払いを確認して記録。Webhook より先に戻っても反映が遅れない） |
| POST | `/webhooks/stripe` | **署名検証のみ** | Stripe のイベント（生ボディ） | `200` |
| POST | `/sessions` | **要検討**（現状は認証なし） | `questionCount` を残りに切り詰め | 既存＋`capped: true` |

**後方互換**: ユーザーのブラウザには古いJSが残る。古いフロントは上限を知らないので、
**サーバ側の判定が本体**（フロントの表示は補助）にする。旧フロントが `POST /sessions` を呼んでも、
上限超過なら明確なエラー（例 `429` ＋理由コード）を返し、旧フロントでも壊れずに止まる形にする。

## 状態・永続化

localStorage は増やさない（購入状態・回答数ともサーバで取得する）。

## テスト方針

- [ ] ユニットテスト: `entitlements.js`（JST 日付境界・残り数の切り詰め・購入済みの素通し）
- [ ] Webhook: 署名が不正なら 400、同一イベント2回で購入が1件のまま、`paid` 以外は無視
- [ ] Stripe のテストカード（`4242…`）で dev から通しで決済し、購入状態が反映される
- [ ] 他人の userId を指定して上限・購入状態を操作できないこと
- [ ] 旧フロント（上限を知らない）が上限超過時に壊れず止まること
- [ ] 公開前: 本番キーで自分の1件だけ実決済 → 返金までを確認

## ロールアウト

1. dev Lambda ＋ Stripe **テストモード**で通しを確認
2. prod Lambda にもテストキーで反映（検証フロントが /prod を叩くため）。公開しない（購入ボタンはフラグで非表示）
3. 特商法表記・プライバシーポリシーを整備
4. **人間に確認のうえ**、本番キーへ差し替え・Webhook 本番登録・購入ボタンを公開
5. 自分で1件実決済 → 反映確認 → 返金

## リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Webhook の署名検証漏れ | 誰でも購入済みに偽装できる | 署名検証を必須にし、失敗テストを書く |
| 認証なしの `/sessions` で他人のカウントを増やされる | 他人を上限到達にできる | 認証追加（案A）。要件確定時に判断 |
| テストキーで動いたまま本番公開してしまう／逆に本番キーで試験してしまう | 決済されない／実際に課金される | 環境ごとにキーを分け、公開時の差し替えは人間確認。公開前に実決済1件で確認 |
| 法的表記の不足（特商法・プライバシー） | 規約違反 | 公開前チェックリストに入れる |
| 上限を「嫌がらせ」と受け取られる | 利用離れ | 30問は無料で十分な量にし、案内は小さく閉じられる形に。上限は spec で調整できる定数にする |
