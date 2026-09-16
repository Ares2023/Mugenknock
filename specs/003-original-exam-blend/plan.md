# オリジナル資格(前提知識)問題を公式資格の出題プールへ既定で混在 — 設計

`spec.md` の受入条件を満たすための実装方針。

## 参照した既存仕様

- `docs/06-exercise-logic.md` §6.1（出題プールの不変条件）§6.2（deficit round-robin・
  実装が2箇所にある）§6.3/6.4（サクッと演習・しっかり対策の選定）§6.6（予想スコア）
- `CLAUDE.md`「Additional レベル（表示名「オリジナル」）の非AWSカード」節
- `src/data/examDomains.json`（AIF/MLA/AIP/DEA/ANS/SCS と ML/DB/NW/SEC の
  ドメイン体系が完全に別物であることを確認）

## アプローチ

### 採用案

1. **公式↔オリジナルの対応表**を `COMPANION_EXAM` として `lambda/src/app.js` と
   `src/constants.ts` の両方に定義する（既存の `AWS_EXAM_TYPES` 等と同じく、
   FE/BE で別コードベースのため重複定義する）。
2. `GET /questions` に **`includeCompanion=true`** パラメータを追加。
   `examType` が `COMPANION_EXAM` にあり、かつ `domain` フィルタが無指定の場合のみ
   companion 側の問題（`!isHidden && !!validityCheckedAt` を同様に適用）を合流する。
   - パラメータ省略時は**従来通り**（既存の呼び出し元＝Stats/Admin/SSG/ExamSetup等は
     無改修で影響を受けない）。
   - `domain` フィルタが指定されている場合は `includeCompanion` を無視する
     （公式ドメインとオリジナル資格のドメインは対応しないため、サーバ側でも
     防御的に無視する。フロント側でも呼ばない）。
3. `domainBalancedOrder`（`lambda/src/app.js`）のバケットキーを
   `q.domain` 単独 → **`${q.examType}:${q.domain}`** の複合キーに変更する。
   単一examTypeのみの呼び出しでは全アイテムのexamTypeが同一なので挙動は変わらない
   （安全な一般化）。`selectionOrder` の `answeredPerDomain` 集計（`idsOnly` 経路、
   `GET /questions` 内）も同じ複合キーで計算するよう合わせる。
   - `src/utils/domainBalance.ts`（フロント側フォールバック実装）は**変更しない**。
     理由: この実装は `getPrefetchA`/`getPrefetchC` が返すプリフェッチキャッシュ経由
     専用で、両関数は現状 `return null` のスタブ（プリフェッチ機能は無効化済み）。
     よって常に `idsOnly` サーバ経路（複合キー版）を通るため、混在プールがこの
     フロント実装に渡ることは無い。ただし将来プリフェッチを復活させる場合は
     同じ複合キー化が必要になる旨を docs に書き残す。
4. `GET /users/me/question-status` にも `includeCompanion=true` を追加。
   指定時は `examType` の `getExamQuestionIdSet(poolOnly:true)` の結果に
   companion 側の同条件の ID を合流してから `UserQuestionStats` をフィルタする。
   これにより演習設定モーダルの「未回答」等の件数表示が実際の出題プールと一致する
   （§6.1 の「母集団を一致させないとズレる」を踏襲）。
5. フロント: `src/views/Home.tsx`（サクッと演習・しっかり対策）と
   `src/views/Practice.tsx`（演習タブ）の3箇所で、
   - 設定に `includeCompanion?: boolean`（既定 `true`。明示的に `false` の時だけ除外。
     既存の `bookmarkOnly` の実装パターン `p?.bookmarkOnly !== false` に倣う）を追加
   - `COMPANION_EXAM[examType]` が存在し、かつドメイン全選択時のみ
     `idsParams`/`fillParams`/(question-status 用パラメータ) に
     `includeCompanion=true` を付与
   - 設定モーダルに「前提知識（{companionName}）を含める」チェックボックスを追加。
     既存の「ブックマークフィルタ」ブロックと同じ見た目パターンで実装し、
     直下に「ドメイン別統計・予想スコアには反映されません」という注記を添える
6. ドメイン別統計・苦手分析・予想スコアへの不算入は**追加実装不要**。
   `UserTagStats` のキー `tagId = ${question.examType}_${domainIdx}` が
   常に**問題自身の examType**を基準にしており（セッションの target examType ではない）、
   AIF практика中にML問題へ回答しても `ML_*` の tagId に記録される。
   AIF側の画面は `tagIdMatches(tagId, 'AIF', i)` のように `AIF_*` のみ読むため、
   自然に混入しない。

### 却下した案

| 案 | 却下理由 |
|---|---|
| オリジナル問題のドメインを公式ドメインへマッピングして「公式ドメインの一部」として扱う | ドメイン体系が別物で正確な対応付けが困難。予想スコア(DOMAIN_WEIGHTS)の意味も変わってしまい、影響範囲が過大 |
| `examType` にカンマ区切りで複数指定できるようにする汎用化 | 既存の多数の呼び出し元（GSIクエリキャッシュ含む）への影響が大きい。今回はcompanion 1個のみのユースケースなので `includeCompanion` の方が変更が局所的 |
| プリフェッチキャッシュ(`getPrefetchA/C`)も companion 対応する | 現状スタブで無効化されており実際には使われていない。対応するだけ複雑化するのでスコープ外 |

## 変更するファイル

| ファイル | 変更内容 |
|---|---|
| `lambda/src/app.js` | `COMPANION_EXAM` 定義、`GET /questions` に `includeCompanion` 対応、`domainBalancedOrder`/`selectionOrder`/`answeredPerDomain` のバケットキーを複合キー化、`GET /users/me/question-status` に `includeCompanion` 対応 |
| `src/constants.ts` | `COMPANION_EXAM`（FE版）を追加 |
| `src/views/Home.tsx` | サクッと演習・しっかり対策それぞれに `includeCompanion` prefs・チェックボックスUI・パラメータ付与 |
| `src/views/Practice.tsx` | 演習タブに同様の prefs・UI・パラメータ付与（模試タブは touch しない） |
| `docs/06-exercise-logic.md` | §6.1〜6.4 相当に「companion 混在」の節を追記 |
| `docs/04-api.md` | `GET /questions` `GET /users/me/question-status` の `includeCompanion` パラメータを追記 |
| `docs/05-screens.md` | Home / Practice の設定モーダルに新フィルタが増えたことを追記 |
| `CLAUDE.md` | Additional レベル節に「公式資格の通常演習に既定混在する」運用を追記 |

## データモデルの変更

なし。既存の `Questions.examType` / `Questions.domain` をそのまま利用する。

**既存データの移行が必要か**: いいえ

## API の変更

| メソッド | パス | 認証 | リクエスト | レスポンス |
|---|---|---|---|---|
| GET | `/questions` | 不要 | 既存パラメータ + `includeCompanion=true`（任意） | 既存と同形。`domain` 指定時は無視 |
| GET | `/users/me/question-status` | 不要（userId query） | 既存パラメータ + `includeCompanion=true`（任意） | 既存と同形 |

**後方互換**: `includeCompanion` は完全にオプトイン（未指定時は現行と同一挙動）。
既存クライアント（古いJSがキャッシュされているブラウザ）はこのパラメータを送らないため無影響。

## 状態・永続化

| キー | 内容 | kvSync 同期 | ゲストでも使うか |
|---|---|---|---|
| `quickExercisePrefs_<uid>.includeCompanion` | サクッと演習の前提知識混在トグル（既存キーへのフィールド追加） | 対象外（既存も非同期） | はい |
| `focusedExercisePrefs_<uid>.includeCompanion` | しっかり対策の同上 | 対象外 | いいえ（しっかり対策はログイン専用） |
| `exercisePrefs_<uid>.<examType>.includeCompanion` | トレーニング演習タブの同上 | 対象外 | はい |

既存の `bookmarkOnly` 等と同じ扱い（単一ブール値、蓄積しない設定値なのでゲスト
localStorage に置いても `CLAUDE.md` の「累積データ」原則には抵触しない）。

## テスト方針

- [ ] 手動確認: AIF/DEA/ANS/SCS それぞれでサクッと演習を開始し、ML/DB/NW/SEC の
      questionId プレフィックスを持つ問題が混ざることを確認
- [ ] 手動確認: 前提知識トグルをOFFにすると混ざらないことを確認
- [ ] 手動確認: ドメイン絞り込み時は混ざらないことを確認
- [ ] 手動確認: 模擬試験の出題プールが変化しないことを確認
- [ ] 手動確認: ML問題に回答後、AIF側のドメイン別統計・苦手分析・予想スコアが
      変化しないこと、ML側の統計には反映されることを確認
- [ ] 手動確認: 設定モーダルの未回答件数がidsOnlyの総数と一致すること

## デプロイ手順

- [ ] `git push github develop`
- [ ] `./scripts/deploy-lambda.sh dev`（Lambda 変更あり）
- [ ] `./prompts/night-prompts/scripts/cf-deploy-status.sh wait`
- [ ] 検証環境で受入条件を確認（検証環境フロントは prod Lambda を叩くため、
      Lambda の動作確認はまずローカル(.env.local→dev Lambda)で行う）
- [ ] （ユーザーの明示指示後）`master` マージ + `./scripts/deploy-lambda.sh prod`

## リスクと巻き戻し方

| リスク | 影響 | 巻き戻し方 |
|---|---|---|
| `domainBalancedOrder` の複合キー化がバグを持ち込む | 全examTypeの通常演習のドメイン偏り是正が壊れる（`CLAUDE.md` に記載の過去実害と同種） | 複合キー化はexamType単一時は無害な一般化のはずだが、念のためデプロイ後に既存examType（companionなし）でのドメイン分布を軽く確認する |
| `includeCompanion` の実装漏れでdomainフィルタ時にも混入 | 意味の無いドメインの問題が出題される | サーバ側でも`domain`指定時は無条件で無視する二重防御を入れる（フロントとサーバ両方） |
