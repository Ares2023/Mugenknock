# 基礎知識(companion)問題のフィルタ優先順位と件数内訳表示 — 設計

`spec.md` の受入条件を満たすための実装方針。

## 参照した既存仕様

- `docs/06-exercise-logic.md` §6.1（前提知識の混在・`includeCompanion`）
- `docs/06-exercise-logic.md` §6.2（ドメイン均等化・`selectionOrder`/`domainBalancedOrder`）
- `docs/06-exercise-logic.md` §6.3（サクッと演習の選定フロー）
- `docs/06-exercise-logic.md` §6.4（しっかり対策の重み付き抽出）
- `lambda/src/app.js`（`selectionOrder` L307-319, `domainBalancedOrder` L281-303,
  `GET /questions` の `includeCompanion` 合流処理 L560-568・`idsOnly` 処理 L613-647,
  `GET /users/me/question-status` の `includeCompanion` 処理 L2194-2242 を実読して確認）
- `src/views/Home.tsx`（しっかり対策の重み付き抽出 L2048-2083、statusCounts取得 useEffect）
- `src/views/Practice.tsx`（演習の `idsOnly` 呼び出し L315/327/419。しっかり対策の重み付き
  抽出コードはPractice.tsxには存在せず、Home.tsxの `startFocusedExercise` のみが実装を持つ
  ことを確認済み）

## アプローチ

### 採用案: 「同スコア階層の中で target→companion の2段抽出」に統一

**適用対象は未回答/不正解/ブックマークのいずれかのフィルタが有効な場合のみ**。
フィルタ無し（全件対象）の通常演習では、target/companionを均等に混ぜるのが
「基礎知識を含める」本来の目的（specs/003-original-exam-blend）であるため現状維持する。

Lambda側 (`selectionOrder`)・クライアント側（しっかり対策の重み付き抽出）の両方で、
**「フィルタ一致度で階層化 → 各階層の中で、まず targetExam の問題だけを既存ロジックで
抽出し尽くす → 足りなければ companion の問題を同じロジックで追加抽出」**という
共通パターンを適用する。

- Lambda: `selectionOrder` が作る各スコア階層（tier）の中身を `domainBalancedOrder` に渡す前に
  `examType === 対象資格` / `それ以外(companion)` で2分割し、target側を先に
  `domainBalancedOrder` した結果 → companion側を `domainBalancedOrder` した結果、の順で連結する。
  target/companionそれぞれの中のドメイン均等化ロジック自体は変更しない。
- しっかり対策（クライアント）: `weightedSampleWithoutReplacement` を
  「targetExamの問題だけのプールに対して実行 → 件数が `count` に届かなければ
  companionの問題だけのプールに対して残り件数分を追加実行」という2段抽出に変更する。
  既存の重み計算式（W_PRIORITY等）はそのまま使う（プールを分けるだけ）。

**混在していない呼び出し（companion問題が無い/includeCompanion未指定）では、
companion側プールが空になるため常に旧来と同じ1段抽出に短絡し、挙動は一切変わらない。**

### 却下した案

| 案 | 却下理由 |
|---|---|
| scoreFnやweight式に「examType一致」を大きな係数で加算する合成スコア方式 | しっかり対策側は`incorrectCounts × W_INCORRECT`が理論上無制限に伸びるため、どんな係数を選んでも「targetを常に上回らせる」保証ができない。Lambda側だけならスコア合成でも行けるが、2つの選定ロジックで異なる手法を取ると挙動の一貫性・保守性が落ちるため、両方に適用できる「プール分割」方式に統一した。 |
| `/users/me/question-status` に内訳（目標資格分/companion分）を返す新パラメータを追加 | spec.mdの対象外方針（新規エンドポイント追加なし）に反する。既存の`includeCompanion`有無で2回呼び分けて差分を取れば済み、Lambda変更もフロントのみで完結する。 |

## 変更するファイル

| ファイル | 変更内容 |
|---|---|
| `lambda/src/app.js` | `selectionOrder`に対象資格(`examType`)を渡し、**`scoreFn`がある（フィルタが有効な）分岐のみ**、各tier内でtarget→companionの2段抽出にする。`scoreFn`が無い（フィルタ無し＝全件を対象にした通常のドメイン均等化のみの）分岐は変更しない——フィルタ無しの時は現状通りtargetとcompanionを均等に混ぜるのが「基礎知識を含める」本来の目的（specs/003-original-exam-blend）であり、target優先はフィルタが有効な場合のみに限定する。`idsOnly`処理の`selectionOrder`呼び出し箇所（L645）を新シグネチャに合わせて更新 |
| `src/views/Home.tsx` | しっかり対策の抽出処理（L2048-2083付近）をtarget/companionプール分割の2段抽出に変更。statusCounts取得useEffectに、companion内訳算出用の追加フェッチ（includeCompanion無しの目標資格単独カウント）を追加し、`companionUnanswered`/`companionIncorrect`/`companionBookmarked`のような差分値をstateに持たせる |
| `src/views/Practice.tsx` | 同様にstatusCounts取得useEffectへ内訳算出用フェッチを追加（Home.tsxと同じロジックを複製、または共通化を検討） |
| `docs/06-exercise-logic.md` | §6.2・§6.3・§6.4に「companion混在時のtarget優先ルール」を追記。実装完了後に反映（spec駆動開発のルール通り） |

## データモデルの変更

なし。

## API の変更

なし（新規エンドポイント無し）。既存の `GET /questions?idsOnly=true` のレスポンス形状・
`GET /users/me/question-status` のレスポンス形状は変更しない。呼び出し回数が
（内訳表示のため）増えるのみ。

**後方互換**: `selectionOrder`のシグネチャ変更はLambda内部関数でありHTTP APIの
リクエスト/レスポンス形状に影響しないため、古いフロントJSとの互換性は保たれる
（キャッシュされた古いフロントが動いていても`idsOnly`のレスポンス形状は不変）。

## 状態・永続化

localStorageの新規キーは追加しない。既存の`quickExercisePrefs_<uid>` /
`focusedExercisePrefs_<uid>` の`includeCompanion`フラグをそのまま使う。

## テスト方針

- [ ] 手動確認: MLA + 基礎知識ON + 不正解優先で、目標資格側の不正解問題数が
      出題数（例: 20問）より少ない状態を用意し、出力された問題IDの中でMLA側が
      何問目まで連続するか確認する
- [ ] 手動確認: 目標資格側の不正解問題数が出題数以上ある状態で、companion問題が
      1問も混ざらないことを確認する
- [ ] 手動確認: サクッと演習・演習（Practice通常）・しっかり対策の3モードで同じ確認を行う
- [ ] 手動確認: 演習設定パネルの件数表示に「（基礎知識N問）」の内訳が出る/消えるパターン
      （基礎知識ON/OFF切り替え、対応資格の有無）を確認する
- [ ] 手動確認: 基礎知識側の問題に回答後、目標資格のドメイン別統計・予想スコアが
      変化しないことを確認する（既存挙動の非回帰確認）

## デプロイ手順

- [ ] `git push github develop`
- [ ] `./scripts/deploy-lambda.sh dev`（`selectionOrder`変更のため必須）
- [ ] `./prompts/night-prompts/scripts/cf-deploy-status.sh wait`
- [ ] 検証環境で受入条件を確認
- [ ] （ユーザーの明示指示後）`master` マージ + `./scripts/deploy-lambda.sh prod`

> **`git push` では Lambda は更新されない。** dev/prod 両方に出す。

## リスクと巻き戻し方

| リスク | 影響 | 巻き戻し方 |
|---|---|---|
| `selectionOrder`のtier内2段抽出化で、companion問題が無い通常呼び出しの挙動が微妙に変わる（意図せぬ回帰） | 全公式資格の通常演習の出題順序に影響しうる（影響範囲が広い） | companion問題が0件のときは必ず旧来の`domainBalancedOrder`単発呼び出しに短絡させる実装にし、単体テスト/手動確認で非混在時の出力が変更前と一致することを確認してからデプロイする |
| しっかり対策の2段抽出で、target側だけでcountに届かない場合にcompanion側の重み付けが不自然になる可能性 | しっかり対策の体感品質低下 | companion側の抽出でも同じ重み式（domainDeficit項を除く）を使うため大きな逸脱は無い想定。QAで違和感があれば重み式を個別調整する |
| 件数内訳表示のための追加フェッチでモーダル表示が遅くなる | UI体感速度の悪化 | 内訳フェッチは合算値取得と並列実行し、内訳が届く前は合算数のみ表示→届き次第「（基礎知識N問）」を追記する段階的レンダリングにする |
