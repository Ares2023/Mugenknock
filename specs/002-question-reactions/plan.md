# 問題ごとの👍👎リアクション ＆ 演習画面フッターの整理 — 設計

`spec.md` の受入条件を満たすための実装方針。

## 参照した既存仕様

- `docs/04-api.md`, `lambda/src/app.js` のブックマークAPI（`POST/DELETE /questions/:id/bookmark`,
  `GET /users/me/bookmarks`）と、`globalAttempts`/`globalCorrect` の集計パターン
  （回答記録トランザクションの外で `ADD` による条件付き加算、失敗は握りつぶす）を読み、
  同じ設計をリアクションにも適用した。

## アプローチ

### 採用案

- 1ユーザー1問1票の状態は既存の `UserQuestionStats`（PK: userId, SK: questionId）に
  `reaction: 'up' | 'down'` を追加するだけで表現できる（ブックマークの `bookmarked` 属性と同型）。
  新規テーブルを作らない。
- 合計集計（管理画面用）は `Questions` テーブルに `reactionUp` / `reactionDown` を追加し、
  `globalAttempts`/`globalCorrect` と同じ「本体書き込みとは別トランザクションの条件付き加算」
  にする。ユーザーの操作（自分の一票を記録する）が集計更新の成否に引きずられないようにするため。
- フロントの表示は「自分が押したものだけ」を返す設計にし、合計はレスポンスに含めない
  （`question-status` の `reactions` は自分の1問1値のみ）。実装ミスで合計を露出させる
  リスクを構造的に無くす。

### 却下した案

| 案 | 却下理由 |
|---|---|
| 新規テーブル `QuestionReactions` を作る | 1ユーザー1問1票は既存の `UserQuestionStats` の形とまったく同じで、テーブルを増やす理由がない |
| 合計数もユーザー側APIで返す | spec 上「ユーザーには合計を見せない」と確定しているため、そもそもフィールドを作らない方が安全（後から誤って出してしまう事故を防ぐ） |
| PromptMenu を「非表示」にするだけで残す | ユーザーの指示は「機能を無くす」なので、コンポーネントごと削除した |

## 変更するファイル

| ファイル | 変更内容 |
|---|---|
| `lambda/src/app.js` | `PUT /questions/:id/reaction` 追加。`GET /users/me/question-status` に `reactions` を追加。`GET /questions`（管理画面が使う一覧）の ProjectionExpression に `reactionUp, reactionDown` を追加 |
| `src/components/Icons.tsx` | `IconMoreVertical` / `IconHeart` / `IconThumbsUp` / `IconThumbsDown` を追加 |
| `src/views/ExerciseSession.tsx` | `PromptMenu` を削除。見出し右の☆（ブックマーク）を削除し、`renderActionRow()` で `[コピー][♡][👍][👎][⋮]` を選択肢の下（回答前）／解説の下（回答後）に同じ配置で描画。フッターの通報・途中採点ボタンを削除し `⋮` メニューへ statement |
| `src/views/Admin.tsx` | 問題一覧の行に 👍/👎 集計を表示（0/0のときは非表示） |

## データモデルの変更

| テーブル | 属性 | 型 | 既存データの扱い |
|---|---|---|---|
| `UserQuestionStats` | `reaction` | `'up' \| 'down'`（無ければ未設定） | 新規追加。既存行は未設定のままで問題ない |
| `Questions` | `reactionUp`, `reactionDown` | Number | 新規追加。未設定は `0` として扱う（表示側で `?? 0`） |

**既存データの移行が必要か**: いいえ（未設定 = 0/未反応として扱えるため）

## API の変更

| メソッド | パス | 認証 | リクエスト | レスポンス |
|---|---|---|---|---|
| PUT | `/questions/:id/reaction` | userId必須（ログイン専用） | `{ userId, reaction: 'up'\|'down'\|null }` | `{ success, reaction }` |
| GET | `/users/me/question-status` | userId | （変更なし） | `reactions: Record<questionId, 'up'\|'down'>` を追加（自分の分のみ） |
| GET | `/questions`（管理画面一覧） | 管理者 | （変更なし） | 各問題に `reactionUp`, `reactionDown` を追加 |

**後方互換**: 既存クライアントは新フィールドを無視するだけなので影響なし。
新エンドポイントの追加のみで既存パスは変更していない。

## 状態・永続化

localStorage の追加なし。リアクションは常にサーバの `UserQuestionStats` が正で、
フロントは取得したものをその場で state に持つだけ（ブックマークと同じ扱い）。

## テスト方針

- [ ] ユニットテストなし（ExerciseSession.tsx に既存のユニットテストが無い方針に合わせる）
- [ ] 手動確認の手順:
  1. 演習画面に「質問プロンプト生成」が存在しないことを確認
  2. 回答前（選択肢の下）と回答後（解説の下）でアクション列の並びが同じであることを確認
  3. 👍を押す→リロード→選択状態が復元することを確認
  4. 👍→👎に変更、同じボタンの再押下で取り消しになることを確認
  5. ⋮ から通報・途中採点が従来通り動作することを確認
  6. 管理画面の問題管理で 👍/👎 の集計が表示されることを確認

## デプロイ手順

- [x] `./scripts/deploy-lambda.sh dev`
- [ ] `git push github develop`
- [ ] `./prompts/night-prompts/scripts/cf-deploy-status.sh wait`
- [ ] 検証環境で受入条件を確認
- [ ] （ユーザーの明示指示後）`master` マージ + `./scripts/deploy-lambda.sh prod`

> `git push` では Lambda は更新されない。dev には反映済みだが、prod への反映は
> ユーザーの明示指示後に別途 `./scripts/deploy-lambda.sh prod` が必要。

## リスクと巻き戻し方

| リスク | 影響 | 巻き戻し方 |
|---|---|---|
| `reactionUp`/`reactionDown` の条件付き加算が失敗し続ける（削除済み問題等） | 集計がズレる。ユーザーの一票記録自体は成功する設計なので実害は管理画面の数字のみ | Lambda側のtry/catchで既に握りつぶし済み。実害があれば管理画面表示側で「N/A」扱いにする |
| PromptMenu 削除で「質問プロンプト生成」を使っていたユーザーが困る | 機能が完全に無くなる（意図した仕様） | 巻き戻す場合は該当コミットを revert すれば元のコンポーネントが復元する |
