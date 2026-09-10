# 08. 構成上の問題点と改善提案

リバースエンジニアリング（2026-09-10）で見つかった構成上の課題。
**優先度は「壊れる確率 × 壊れたときの痛さ ÷ 直すコスト」で付けている。**

コードは今回一切変更していない。着手する項目を選んで指示すること。

---

## 優先度A — 品質のセーフティネットが機能していない

### A-1. TypeScript の型チェックがビルドで無効化されている

```ts
// next.config.ts
eslint: { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors: true },
```

コメントには「移行期間中の暫定措置」とあるが、Next.js 移行はすでに完了している。

**根本原因**: `typescript: ^4.9.5` が古すぎて、依存パッケージの `.d.ts` を**構文解析できない**。

```
$ npx tsc --noEmit
→ 258 errors、すべて node_modules 起因
  （zod の `const` 型パラメータなど TS 5.0+ 構文）
→ src/ app/ 由来のエラーは 0 件
```

**提案**: `typescript` を 5.x へ上げ、`ignoreBuildErrors` を外す。
`src/` 側にエラーが出ていないので、移行コストは低い可能性が高い。
（ただし .d.ts が壊れている間は型が `any` に落ちて下流のエラーが隠れているため、
アップグレード後に初めて出るエラーはある。段階的に潰す前提で）

**コスト**: 小〜中 / **効果**: 大（以後のリグレッションを型で止められる）

### A-2. ESLint が動いていない

```
$ npx next lint
→ Invalid Options: Unknown options: useEslintrc, extensions, ...
```

`eslint: ^10.5.0`（フラットコンフィグ必須）＋ `eslint-config-next: ^16.2.9`（Next 16向け）に対し、
本体は `next: ^15.5.19`、設定は `package.json` の**レガシー `eslintConfig` キー**。三者が食い違っている。

**提案**: `eslint.config.mjs`（フラットコンフィグ）を作り、`eslint-config-next` を Next 15 系に合わせる。
または Next 16 へ上げて `next lint` を捨て ESLint CLI へ移行する。

**コスト**: 小 / **効果**: 大

### A-3. 自動テストが1本も無い

```
"test": "echo 'No tests configured'"
find src app lambda -name '*.test.*' → 0 件
```

E2E（Playwright）はあるが、**本番/検証環境に対して動く**ので開発中のフィードバックにならない。

とくに次のロジックは純粋関数に近く、ユニットテストの費用対効果が非常に高い:

| 対象 | ファイル |
|---|---|
| `domainBalancedOrder` / `selectionOrder` | `lambda/src/app.js`, `src/utils/domainBalance.ts` |
| `buildQuestionWriteFields`（問題の不変条件） | `lambda/src/app.js` |
| `estimatedScore` の算出 | `src/views/Home.tsx`（要抽出） |
| 採点ロジック | `src/views/ExerciseSession.tsx`（要抽出） |
| `qDomainIndex` / `makeTagId` / `storedDomainsToNames` | `src/constants.ts` |
| kvSync の LWW マージ | `src/utils/kvSync.ts` |

**提案**: Vitest を入れ、まず上記6つだけテストを書く。UI テストは当面 E2E に任せる。

**コスト**: 中 / **効果**: 大（[06-exercise-logic.md](06-exercise-logic.md) の内容が仕様として固定される）

---

## 優先度B — 二重管理（片方だけ直すと壊れる）

### B-1. ドメイン均等化アルゴリズムが2箇所にある

| 場所 | 使われる経路 |
|---|---|
| `lambda/src/app.js` `domainBalancedOrder` | `GET /questions?idsOnly=true` |
| `src/utils/domainBalance.ts` `domainBalancedOrder` | `idsOnly` を通らないフォールバック |

現状ロジックは一致しているが、**片方だけ変更すると出題傾向が経路によって変わる**。
しかも「サーバ実装だけ prod にデプロイし忘れて1か月偏った」という前科がある領域。

**提案**: フォールバック経路が本当に必要かを確認し、不要なら**クライアント側実装を削除**して
サーバ実装に一本化する。必要なら共有パッケージ化する。

**コスト**: 小 / **効果**: 大

### B-2. `examDomains.json` の二重管理 → **対処済み（既存実装。当初の指摘は誤り）**

> **訂正（2026-09-10）**: 初版で「同期を保証する仕組みが無い」と書いたのは調査漏れによる誤り。
> `scripts/deploy-lambda.sh` が ZIP 作成の**前に**マスタを Lambda 側へコピーしており、
> 同期は既に担保されている。`lambda/src/constants.js` にもその旨のコメントがある。

```bash
# scripts/deploy-lambda.sh:34-36
cp "$REPO_ROOT/src/data/examDomains.json" "$LAMBDA_SRC/examDomains.json"
```

現状の整理:

| 参照元 | 参照するファイル |
|---|---|
| フロント（`src/constants.ts`） | `src/data/examDomains.json`（マスタ） |
| Lambda（`lambda/src/constants.js`） | `lambda/src/examDomains.json`（デプロイ時に上書きされる従属コピー） |
| 夜間バッチ（`01`/`02`） | 環境変数 `EXAM_DOMAINS_JSON_PATH` 経由で**マスタを直接読む** |

3系統すべてマスタに収束している。内容も完全一致を確認済み。

**残る小さな懸念**（対応は任意）:
`lambda/src/examDomains.json` が git 追跡されているため、
マスタを編集してから deploy するまでの間、リポジトリ上は2ファイルが食い違って見える。
`.gitignore` に入れて「デプロイ時生成物」と明示すればマスタが一意になるが、
デプロイ成果物の中身が git から見えなくなるトレードオフがある。

### B-3. ユーザーデータ削除が2実装ある

`executeUserDataReset`（`POST /users/me/reset`）と `executeUserDataDeletion`（`POST /admin/direct-delete`）。
消す範囲が微妙に違う。

| 対象 | reset | admin delete |
|---|---|---|
| UserQuestionStats / UserTagStats / Sessions | ✅ | ✅ |
| UserAnswers | ❌（**孤児化させる**・高速化のため） | ✅ |
| EncyclopediaUnlocks | 空で上書き | 削除 |
| UserPoints | ✅ | ✅ |
| `userPrefs_*`（kv 含む） | ✅ | ❌ |
| `dailyProgress_*` | ✅ | ❌ |
| `scoreHistData_*` | ✅ | ❌ |
| Reports | ❌ | ✅ |

**「全消し」を謳う admin 側の方が消し残しが多い**。GDPR 的な意味でも危うい。

**提案**: 削除対象のリストを1つの関数に集約し、`{ keepAnswers: bool }` 等のオプションで分岐させる。

**コスト**: 小 / **効果**: 中（データ整合・法務リスク）

### B-4. `ADMIN_EMAIL` / Cognito ID / API エンドポイントのハードコードが散在

```
src/constants.ts       ADMIN_EMAIL = 'mugenknock@gmail.com', API_ENDPOINT のフォールバック
lambda/src/constants.js ADMIN_EMAIL
lambda/src/app.js      userPoolId, clientId, USER_POOL_ID（同じ値が2箇所）
app/questions/[examType]/page.tsx  API のフォールバックURLを再定義
```

**提案**: Lambda 側は環境変数へ、フロント側は `constants.ts` の1箇所に寄せる。

**コスト**: 小 / **効果**: 中

---

## 優先度C — セキュリティ

### C-1. 認証なしで `userId` を受け取るエンドポイントがある

`/users/me/*` は `requireUser` が `userId` をトークンの `sub` で上書きするが、
以下は**クライアントの申告をそのまま信用**している。

| エンドポイント | できてしまうこと |
|---|---|
| `POST /sessions` | 他人の userId でセッションを作る |
| `POST /sessions/:id/answers` | 他人の統計を汚染する |
| `PUT /sessions/:id` | 他人のセッションを完了扱いにする |
| `GET /sessions/:id?userId=` | 他人のセッション内容を読む |
| `GET /sessions/:id/answers?userId=` | 他人の解答履歴を読む |
| `POST/DELETE /questions/:id/bookmark` | 他人のブックマークを操作する |
| `POST /announcements/mark-read` | 他人の既読を操作する |

**ゲスト（`userId='guest'`）でも演習できる必要がある**ため単純に `requireUser` は当てられない。

**提案**: 「Authorization ヘッダがあれば検証して `sub` で上書き、無ければ `'guest'` を強制」という
`optionalUser` ミドルウェアを作り、上記に適用する。既存クライアントの互換を壊さずに塞げる。

**コスト**: 中 / **効果**: 大

### C-2. ポイントがクライアント計算＋絶対値送信

`PUT /users/me/points` は `Math.max(0, Math.round(n))` に丸めるだけ。
任意の値を送れば残高を自由に設定できる。

現状の消費先が「日めくり再抽選（30pt）」だけなので実害は小さいが、
報酬機能を増やす前に対処すべき。

**提案**: サーバ側で「セッション結果から獲得ポイントを計算する」方式へ寄せる。
あるいは少なくとも `delta` 加算方式にして上限を設ける。

**コスト**: 中 / **効果**: 中（機能拡張時に効く）

---

## 優先度D — 巨大ファイル

| ファイル | 行数 | 中身 |
|---|---|---|
| `src/views/Admin.tsx` | 3,985 | 16タブ分の管理UIが1ファイル |
| `lambda/src/app.js` | 3,337 | 約90エンドポイント + ユーティリティ |
| `src/views/Home.tsx` | 3,217 | 日めくり・スコア・チャート・演習開始・モーダル多数 |
| `src/views/CheatSheet.tsx` | 1,768 | うち約820行が `CHEAT_DATA` 定数 |
| `src/views/ExerciseSession.tsx` | 1,658 | 解答UI・採点・ドラフト・コピー・プロンプト生成 |
| `src/views/MyPage.tsx` | 1,544 | |
| `src/components/Layout.tsx` | 1,288 | ナビ・ヘッダー・フッター・パンくず・キーボード操作 |

**分割の優先順位**（副作用が小さく効果が大きい順）:

1. **`CheatSheet.tsx` → データを分離**
   `CHEAT_DATA` を `src/data/cheatSheet.ts` へ出すだけで約820行減る。ロジックに触れない。**最も安全。**

2. **`Admin.tsx` → タブ単位でコンポーネント分割**
   `src/views/admin/QuestionsTab.tsx` 等。タブは既に独立しているので機械的に切り出せる。

3. **`Home.tsx` → モーダル群とチャートを分離**
   `CombinedDetailModal` / `ScoreDetailModal` / `DomainDetailModal` / `OnboardingModal` /
   `TodayServiceSection` / `ScoreLineChart` / `SessionScoreChart` は既に独立した関数コンポーネント。
   ファイルを分けるだけで大幅に減る。
   **併せて `startQuickExercise` / `startFocusedExercise` / `estimatedScore` を
   `src/utils/` へ抽出するとテスト可能になる（A-3 と接続）。**

4. **`lambda/src/app.js` → ルーター分割**
   `routes/questions.js` / `routes/sessions.js` / `routes/users.js` / `routes/admin.js` / `routes/content.js`。
   express の `Router` を使えば挙動は変わらない。ただし**デプロイ後に実機確認が必須**。

**コスト**: 1→2→3→4 の順に増える / **効果**: 中（保守性・AIの編集精度）

---

## 優先度E — 一貫性・規約の未強制

### E-1. i18n が2系統

- `src/i18n/translations.ts` + `t('key')` … 136箇所
- `ja ? '日本語' : 'English'` の三項演算子 … **419箇所**

三項演算子が3倍多い。実質「i18n の仕組みはあるが使われていない」状態。

**提案**: 新規コードは `t()` に統一するルールを `CLAUDE.md` に追加。既存の一括移行は費用対効果が低いので、
触ったファイルから直す方針で十分。

### E-2. デザイントークンが守られていない

`CLAUDE.md` は「余白・フォントサイズ・影・角丸はトークン必須、生px禁止」と規定しているが:

- `style={{ ... }}` インラインスタイル … **2,679箇所**
- `fontSize: <数値>` の生px … **404箇所**

**提案**: ESLint（A-2）を復活させたうえで、`no-restricted-syntax` で
`fontSize: <NumericLiteral>` を警告にする。機械的に検出できれば自然に減る。

### E-3. `useWindowWidth` フックがあるのに使われていない

`src/hooks/useWindowWidth.ts` は存在するが、`innerWidth < 768` の resize リスナーを
**17ファイルが個別に実装している**（利用は5ファイルのみ）。

**提案**: 触ったファイルから `useWindowWidth` に置き換える。低リスク。

### E-4. `any` が79箇所

とくに `location.state` 経由の画面間データ受け渡しが `any` に落ちている
（`ExerciseSession` の `draft`, `createSession` など）。
ここは**画面間の契約そのもの**なので、型を付ける価値が最も高い。

**提案**: `src/types/navigation.ts` に `ExerciseSessionState` / `ExamSessionState` /
`ResultState` を定義し、compat 層の `useLocation<T>()` をジェネリックにする。

---

## 優先度F — 死んだコード・リポジトリの衛生

### F-1. `README.md` が Create React App のボイラープレートのまま → **対応済み（2026-09-10）**

`npm start` / `npm test` / `npm run eject` を案内しており、**すべて実在しないか嘘**だった。
本ドキュメント作成時に、実際のセットアップ手順と `docs/` への導線に書き換え済み。

**残り**: `README.old.md`（中身は `# AWS Quiz App` の1行のみ）は未削除。削除してよい。

### F-2. `.gitignore` に書いたのに追跡され続けているファイル

```
.gitignore に prompts/ があるが、git 追跡ファイルは 1,524 個
  うち prompts/logs/ が 378 個
```

git 追跡は `.gitignore` より優先されるため、**夜間バッチが動くたびに `git status` が汚れる**。
セッション開始時の git status が数百行のログ差分で埋まり、本当の変更が見えない。

同様に `tsconfig.tsbuildinfo`（366KB のビルドキャッシュ）も追跡されている。

**提案**:
```bash
git rm -r --cached prompts/logs prompts/night-prompts/logs tsconfig.tsbuildinfo
```
`prompts/` 全体を外すか、スクリプト本体だけ残してログ類を外すかは要判断
（スクリプトは資産なので残す価値がある → その場合は `.gitignore` から `prompts/` を外し、
`prompts/logs/` と `prompts/night-prompts/logs/` を個別に無視する方が意図に合う）。

**コスト**: 極小 / **効果**: 大（日々の作業効率）

### F-3. 未使用の依存・ファイル

| 対象 | 状況 |
|---|---|
| `xstate` | **参照0件** |
| `use-sync-external-store` | **参照0件** |
| `use-isomorphic-layout-effect` | **参照0件** |
| `@testing-library/*` 4パッケージ | `src/setupTests.ts`（CRA遺物）からのみ。テスト0件 |
| `web-vitals` | `src/reportWebVitals.ts`（CRA遺物）からのみ。呼び出し元なし |
| `@types/node: ^16` | 実行環境は Node 20 |
| `src/setupTests.ts` / `src/reportWebVitals.ts` | CRA 遺物・未使用 |
| `build/`（8.8MB） | CRA 時代のビルド成果物。現在の出力は `out/` |
| `import_questions.py` / `questions/*.json` | 手動インポート時代の遺物。現在は夜間バッチが API 経由で投入 |
| `docs/archive/questions-management.docs` | 上記の手順書（アーカイブ済み） |
| `Tags` テーブル | 未使用 |
| `QuestionTagRelations` テーブル | 新規書き込みなし。削除時の掃除のみ |
| `README.old.md` | 1行 |

**注意**: `@testing-library/*` は A-3（テスト導入）で使う可能性があるので、
テストを書く方針なら残す（ただし `dependencies` ではなく `devDependencies` へ移す）。

### F-4. Capacitor / Android が休眠している

`android/` は 113MB（追跡ファイル53個）、`capacitor.config.ts` の `webDir` は
**`'build'`**（＝CRA時代のパス。現在の出力は `out/`）。
`package.json` に `@capacitor/*` の依存が無いため、**現状ビルドできない。**

**提案**: 使う予定があるなら `webDir: 'out'` に直して依存を復活させる。
無いなら別ブランチ/別リポジトリへ退避してリポジトリから外す。

**コスト**: 小 / **効果**: 中（clone サイズ・混乱の除去）

---

## 優先度G — アーキテクチャ上の懸念（すぐには壊れないが将来効く）

### G-1. `AppSettings` が汎用KVSになっている

1テーブルに「管理者リスト」「テーマ」「ユーザー設定」「スコア履歴」「日次進捗」が同居し、
`settingId` の文字列規約（`userPrefs_<uid>` 等）だけが構造を担保している。

- `POST /users/me/reset` が `begins_with(settingId, 'scoreHistData_<uid>_')` で **Scan** している
- 属性名が動的（`dailyProgress_<uid>` の `<examType>_<日付>`）で、剪定ロジックが必要になっている

**提案**: 少なくとも `UserPreferences` と `UserScoreHistory` は独立テーブルへ分離する。
移行が必要なので優先度は低いが、**ユーザーが増えると Scan コストが効いてくる**。

### G-2. GSI が1本しか無く Scan 依存が多い

`GET /admin/questions/flagged` は**1リクエストで Scan を2回**（matched + auditCount）実行する。
問題は現在4,892件で、今後も夜間バッチが増やし続ける。

**提案**: 管理画面用に `validityCheckedAt` や `auditFlaggedAt` の GSI を検討する。
ただしオンデマンド課金＋管理者1人の利用なので、優先度は低い。

### G-3. `.env.production` が全ビルドで効く

Cloudflare Pages の Preview ビルドも `/prod` API を向くため、
**検証環境で dev Lambda の変更を確認できない**。

現在は「Lambda は dev/prod 両方に必ずデプロイする」という運用ルールで回避しているが、
本来は Cloudflare Pages の環境変数だけで分岐させるべき。

**提案**: `.env.production` から `NEXT_PUBLIC_API_ENDPOINT` を削除し、
Cloudflare Pages ダッシュボードの Production/Preview 環境変数に一本化する。
（ローカルは `.env.local` があるので影響なし）

**コスト**: 小 / **効果**: 中（検証環境が本来の役割を果たすようになる）

### G-4. 画面間のデータ受け渡しが `sessionStorage` 経由の `state` に強く依存

compat 層の `useLocation().state` は `sessionStorage.__nav_state__` を**1回読んだら消す**設計。

- リロードすると state が消える → 各画面がドラフト復元にフォールバックする実装を持つ
- `ExerciseSession` / `ExamSession` / `Result` はすべてこのフォールバックがある
- `Result` は state が無いと**何も表示できない**（API 再取得しない）

**提案**: 中期的には URL パラメータ（`?sessionId=`）＋API取得へ寄せる。
現状は動いているので優先度は低いが、compat 層を剥がすときに必ずぶつかる。

---

## まとめ（着手順の推奨）

```
済み   F-1（README 書き換え・2026-09-10）
       F-2（git 追跡の掃除・2026-09-10）
       B-2（調査の結果すでに実装済みだった。指摘を訂正）
1週目  A-1（TypeScript 5 へ）→ A-2（ESLint 復活）
3週目  A-3（純粋関数のユニットテスト6本）
4週目  C-1（optionalUser ミドルウェア）
以降   D-1〜D-3（巨大ファイル分割・テストが揃ってから）
       B-1 / B-3 / F-3 / F-4
```

**A-3 のテストが揃う前に D（大規模分割）へ行かないこと。**
安全網なしで3,000行のファイルを割ると、壊れたことに気づけない。
