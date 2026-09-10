# 05. 画面仕様

## 5.1 ルーティング一覧

`app/` 配下の `page.tsx` は薄いラッパーで、実体は `src/views/`。
アプリ本体（`/aws/*`）はすべて `dynamic(..., { ssr: false })` でクライアント専用。

| URL | View | SSR | 認証 | 概要 |
|---|---|---|---|---|
| `/` | `Portal.tsx` | ✅ | 不要 | LP（サービス紹介） |
| `/aws/` | `Home.tsx` | ❌ | 不要 | **アプリのホーム。演習の起点** |
| `/aws/practice` | `Practice.tsx` | ❌ | 不要 | トレーニング（演習/模試のカスタム設定） |
| `/aws/exercise/session` | `ExerciseSession.tsx` | ❌ | 不要 | 演習の解答画面（即時採点） |
| `/aws/exam/setup` | `ExamSetup.tsx` | ❌ | 不要 | 模試の設定 |
| `/aws/exam/session` | `ExamSession.tsx` | ❌ | 不要 | 模試の解答画面（時間制限） |
| `/aws/result` | `Result.tsx` | ❌ | 不要 | 採点結果 |
| `/aws/mypage` | `MyPage.tsx` | ❌ | **要** | 学習状況・苦手分析・ブックマーク |
| `/aws/stats` | `Stats.tsx` | ❌ | **要** | 成績・履歴 |
| `/aws/encyclopedia` | `ServiceEncyclopedia.tsx` | ❌ | 不要 | AWSサービス図鑑（解放制） |
| `/aws/cheatsheet` | `CheatSheet.tsx` | ❌ | 不要 | 資格別チートシート（静的データ） |
| `/aws/exam-dashboard` | `ExamDashboard.tsx` | ❌ | 不要 | 全資格の進捗ダッシュボード |
| `/aws/announcements` | `Announcements.tsx` | ❌ | 不要 | お知らせ |
| `/aws/release-notes` | `ReleaseNotes.tsx` | ❌ | 不要 | リリースノート |
| `/aws/others` | `Others.tsx` | ❌ | 不要 | その他メニュー・問い合わせ |
| `/login` | `LoginPage.tsx` | ❌ | 不要 | Amplify Authenticator |
| `/account` | `Account.tsx` | ❌ | 不要 | アカウント設定・データ削除 |
| `/about` | `About.tsx` | ✅ | 不要 | サイト情報 / プライバシー / 利用規約 / 運営者情報 |
| `/architecture` | `ArchitecturePage.tsx` | ✅ | 不要 | サイト構成図（技術紹介） |
| `/privacy-policy` | (inline) | ✅ | 不要 | SEO 用プライバシーポリシー |
| `/encyclopedia` | `PublicEncyclopedia.tsx` | ✅ | 不要 | **SEO 用**の公開サービス図鑑 |
| `/services` `/services/[name]` | (inline) | ✅ | 不要 | **SEO 用**サービス解説（`awsServiceCatalog.ts` から生成） |
| `/exam-guide` `/exam-guide/[type]` | (inline) | ✅ | 不要 | **SEO 用**資格別ガイド（`constants.ts` から生成） |
| `/questions/[examType]` `/[questionId]` | (inline) | ✅ | 不要 | **SEO 用**問題ページ（ビルド時に API から生成） |
| `/admin` | `Admin.tsx` | ❌ | **管理者** | 管理画面 |
| `/admin-login` | `AdminLogin.tsx` | ❌ | 不要 | 管理者ログイン |

### レイアウト

`app/aws/layout.tsx` が `src/components/Layout.tsx` を適用する。`/aws/*` 以外は素の画面。

`Layout.tsx`（1,288行）の責務:
- デスクトップ: 左サイドナビ（ホーム / トレーニング / マイページ + 図鑑・チートシート・お知らせ・リリースノート）
- モバイル: 下部タブバー（ホーム / トレーニング / マイページ）
- ヘッダー（ロゴ・お知らせベル・アカウント）、パンくず、フッター
- キーボードナビゲーション、問い合わせモーダル、AI（ChatGPT/Gemini/Claude）へのリンク

### ブレークポイント

`window.innerWidth < 768` が `isMobile`。**各画面が個別に resize リスナーを持っている**
（`src/hooks/useWindowWidth.ts` はあるが、多くの画面が使っていない）。

---

## 5.2 Home（`/aws/`）— 3,217行

**アプリの中心。ここから全ての演習が始まる。**

### セクション構成

```
[ゲストバナー]（未ログイン時）
[オンボーディングモーダル]（targetExam 未設定時）
─────────────────────────
 今日のサービス（日めくり）
─────────────────────────
 予想スコア + ドメイン別正答率
   → タップで CombinedDetailModal（スコア推移・ドメイン詳細）
─────────────────────────
 プライマリ演習ボタン
   ├ サクッと演習（quick）        … 常時
   └ しっかり対策（focused）      … ログイン + 30問解答で解放
   （再開ドラフトがあれば「再開する」表示）
─────────────────────────
```

### 主要 state

| state | 由来 | 説明 |
|---|---|---|
| `targetExam` | `localStorage.targetExam_<uid>` | 未設定ならオンボーディング表示 |
| `quickDraft` / `focusedDraft` | `localStorage.*Draft_<uid>` | 起動時に `hydrateDraftsFromServer()` でサーバ分を補完 |
| `answeredCount` | `GET /users/me/question-stats` | Focused 解放判定（30問） |
| `domainStats` | `GET /users/me/stats` | stale-while-revalidate（sessionStorage キャッシュ） |
| `estimatedScore` | `domainStats` から算出 | → [06-exercise-logic.md](06-exercise-logic.md) |
| `lastMode` | `localStorage.lastQuickMode_<uid>` | どちらをプライマリに出すか |

### 起動時のデータ取得

```
authLoading 解除
  → targetExam を localStorage から読む（無ければオンボーディング）
  → hydrateDraftsFromServer(userId)     … GET /users/me/active-sessions + GET /questions?ids=
  → GET /users/me/question-stats        … answeredCount（Focused 解放判定）
  → GET /users/me/stats                 … domainStats（SWR: キャッシュ即表示→背後で更新）
  → GET /users/me/score-history         … スコア推移
  → GET /daily-service?userId=          … 今日のサービス
```

### 注意点

- `uid` は `user?.userId ?? 'guest'`。**認証確定前は `'guest'` で localStorage を読んでいる**ため、
  `user` 確定時に正しい uid で再読込する `useEffect` が必要（既にある）
- 演習開始時は `autoScoreAndClearDrafts(userId, [quick, focused])` で**プライマリ枠2種のみ**確定。
  practice / exam のドラフトは残す
- ドラフト破棄と `targetExamChanged` / `pointsChanged` / `kvSynced` の CustomEvent 購読が多数ある

---

## 5.3 Practice（`/aws/practice`）— トレーニング

タブで「演習」と「模試」を切り替える。**オリジナル（非AWS）カードでは模試タブを出さない**
（`isNonAwsExam(targetExam)` なら `tab === 'exam'` を強制的に `'exercise'` へ戻す）。

### 演習タブ

設定: 資格 / ドメイン選択 / 問題数 / 回答状況フィルタ（未回答・不正解・未正解）/ ブックマーク優先。
設定は `localStorage.exercisePrefs_<uid>` に保存され kvSync で同期される。

開始時のフロー:
```
GET /questions?examType=&idsOnly=true&domain=&<filters>&userId=
  → 先頭 count 件を採用（サーバ側でフィルタ優先＋ドメイン均等化済み）
  → 足りなければ フィルタ無しで再取得して補充
GET /questions?ids=<1問目>&withAnswers=true
  → navigate('/aws/exercise/session', { state: { createSession, questions, questionIds, ... } })
```

### 模試タブ

`EXAM_CONFIGS[examType]` の問題数・制限時間が既定。ミニ模試（`isMini`）も選べる。
`navigate('/aws/exam/session', { state: { sessionId, questions, timeLimitMin, isMini } })`。

---

## 5.4 ExerciseSession（`/aws/exercise/session`）— 1,658行

演習（quick / focused / practice）共通の解答画面。**1問ずつ即時採点・解説表示。**

### 起動

`location.state` から受け取る:

| キー | 説明 |
|---|---|
| `createSession` | `POST /sessions` のリクエストボディ。**遷移先で非同期に作成**（体感速度のため） |
| `questions` | 最初に表示する問題（1問だけのこともある） |
| `questionIds` | 全問のID。残りはプログレッシブロード |
| `spareQuestionIds` | 予備ID。削除済み等で読めないIDが出ても問題数を満たすため |
| `isQuick` / `isFocused` / `isMini` | 種別フラグ |

state が無ければ `localStorage` のドラフトから復元。それも無ければ `/aws/` へ戻る。

### プログレッシブロード

```
1問目を表示 → 背後で GET /questions?ids=<次のバッチ>&withAnswers=true
```
問題数が増えても開始が一定時間で済むようにするための根本対策。

### 解答時

```
選択 → 採点（correctAnswerIndices と比較）
     → 即時に正誤・解説・choiceExplanations を表示
     → POST /sessions/:id/answers（非同期・待たない）
     → PUT /sessions/:id/progress でドラフト保存
```

### 完了時

```
score = 正解数 / 問題数 * 100
isPassed = score >= PASS_RATE[examType]（ミニ模試は 1/5 に緩和）
PUT /sessions/:id { status:'completed', score, isPassed }
recordSessionDomainStats()  → localStorage + PUT /users/me/domain-results
incrementDailyProgress()    → POST /users/me/daily-progress
addPoints()                 → PUT /users/me/points
localStorage からドラフト削除・activeExerciseDraft ポインタ削除
navigate('/aws/result', { state: { results, questions, score, ... } })
```

`activeExerciseDraft`（uid 無しの単一キー）は「今どの種別のドラフトがアクティブか」を指すポインタ。

### その他の機能

- **コピーボタン** — 問題文・選択肢・解説をクリップボードへ（プロダクト原則2の実装）
- **PromptMenu** — ChatGPT / Gemini / Claude に貼るプロンプトを生成
- **ブックマークトグル** — `POST/DELETE /questions/:id/bookmark`
- **通報** — `ReportModal` → `POST /questions/:id/report`
- **コラム** — `GET /tips?examType=` を問題間に挟む
- **「わからない」** — 選択肢とは別の回答（`WAKARANAI` 定数）

---

## 5.5 ExamSetup / ExamSession（模試）

### ExamSetup（`/aws/exam/setup`）

ステップ形式（`StepRow`）で設定:
1. 資格
2. 出題ドメイン（任意）
3. 問題数・制限時間（`EXAM_CONFIGS` 既定 or ミニ）
4. フィルタ（未回答 / 不正解 / ブックマーク）

`GET /users/me/stats` でドメイン別正答率を表示し、`GET /users/me/sessions` で過去の模試結果を見せる。

### ExamSession（`/aws/exam/session`）

- **時間制限あり**（`timeLeft` をカウントダウン。0で自動提出）
- **即時採点しない**。全問解いてから一括提出
- 問題一覧パネルで未回答・フラグ付きを俯瞰できる
- `PUT /sessions/:id/progress` で `{ currentIndex, answers, timeLeft }` を定期保存
- 提出時に全問の `POST /sessions/:id/answers` を送ってから `PUT /sessions/:id`

`location.state` が無ければ `/aws/exam/setup` へ `replace` で戻る。

---

## 5.6 Result（`/aws/result`）

`location.state` で結果を受け取る（**API 再取得しない**）。

表示: スコア / 合否 / 獲得ポイント / 日次ボーナス / 問題別の正誤と解説。

「もう一度」ボタンの遷移先が種別で分岐する:
- `isFocused` → `/aws/` に `{ startFocused: true }` を渡して再開
- `isQuick` → 同じ条件で `GET /questions?idsOnly=true` して `/aws/exercise/session`
- 模試（`isExam && !isQuick`）→ `/aws/exam/setup`

---

## 5.7 MyPage（`/aws/mypage`）— 1,544行・**ログイン必須**

| セクション | データ源 |
|---|---|
| 目標資格・受験日・カウントダウン | `GET /users/me/preferences` |
| 日次目標の達成率 | `GET /users/me/daily-progress` |
| 演習量・解放状況 | `GET /users/me/question-stats` |
| **苦手分析**（ドメイン別・直近10/20/30問） | `GET /users/me/stats` の `recentResults` |
| 頻出ミス問題 | `GET /users/me/weak-questions?minIncorrect=2` |
| ブックマーク一覧 | `GET /users/me/bookmarks` → 個別 `GET /questions/:id` |
| 直近セッション | `GET /users/me/sessions?limit=200` |

「しっかり対策を開始する」ボタンは `/aws/` へ `{ startFocused: true }` を渡して遷移し、Home 側で自動起動する。

---

## 5.8 Stats（`/aws/stats`）— **ログイン必須**

- スコア推移チャート（`ScoreLineChart`）
- 活動量チャート（`ActivityChart`）
- ドメイン別正答率（`STATS_GOOD_RATE=70` / `STATS_FAIR_RATE=50` で色分け）
- セッション履歴 → 展開して `GET /sessions/:id/answers` で問題別の正誤を表示
- 履歴からその場でブックマーク操作ができる

---

## 5.9 ServiceEncyclopedia（`/aws/encyclopedia`）— 図鑑

日めくりで解放したサービスのコレクション。

- 母数: `GET /daily-service?list=1`（`isServiceUnlockable` を満たすものだけ）
- 解放状況: `GET /users/me/encyclopedia-unlocks`（ログイン時）/ `localStorage`（ゲスト）
- 未解放は伏せ字表示、解放済みはアイコン・説明・豆知識・公式ドキュメントリンク
- 詳細は必要時に `GET /daily-service?serviceId=` で取得

**アイコン解決**は `ServiceIconImg`（`src/components/Icons.tsx`）が
`public/icons/aws/` の SVG（80×80）を優先し、無ければ PNG（64×64）にフォールバックする。

---

## 5.10 CheatSheet（`/aws/cheatsheet`）— 1,768行

**データがコンポーネント内の静的定数 `CHEAT_DATA` に直書きされている**（DBではない）。
DB 側は `CheatSheetDeletions` テーブルが「削除予定フラグ」のオーバーレイを持つだけで、
`GET /cheatsheet-deletions` の `deleteDate` を過ぎた項目をフロントが非表示にする。

### 用語の記述ルール（`CLAUDE.md` にも規定）

有名な別名があれば**必ず併記する**。試験では日本語訳と英語表記が混在して出題されるため。

- `desc`: `和名（English）` — 例「異常検知（Anomaly Detection）」
- `tags`: `和名 / English` — 例「マネージドルール / Managed Rules」

---

## 5.11 Admin（`/admin`）— 3,985行

`AdminLayout` + タブ。タブ状態は `localStorage.adminActiveTab` に保存。

| グループ | タブ |
|---|---|
| コンテンツ | 問題管理 / 問題追加 / 生成状況 / スキャン結果 / コラム管理 / コラムのネタ / 日めくりAWSサービス / リリースノート / 合格コメント |
| 運営 | お知らせ管理 / 通報確認 / メッセージ / データ削除 |
| 設定 | テーマ設定 / 管理者設定 / サイト情報 |

- すべてのリクエストは `adminFetch` が `Authorization: Bearer <idToken>` を付ける
- 「スキャン結果」タブ = `GET /admin/questions/flagged`（妥当性チェックの結果一覧）。
  `filter=flagged|hidden|audit|fixed` で切り替え、修正案の apply / reject ができる
- 「データ削除」タブ = `POST /admin/direct-delete`（メールアドレス指定）

---

## 5.12 SEO ページ群（静的生成）

`app/` に直接 JSX が書かれており、`src/views/` を経由しない。

| ページ | 生成元 | `generateStaticParams` |
|---|---|---|
| `/questions/[examType]/[questionId]` | `GET /questions/public?examType=`（ビルド時） | `EXAM_TYPES` × 問題 |
| `/exam-guide/[type]` | `src/constants.ts`（`EXAM_CONFIGS` / `EXAM_DOMAINS` / `DOMAIN_WEIGHTS`） | `EXAM_TYPES` |
| `/services/[name]` | `src/data/awsServiceCatalog.ts` + `GET /daily-service?serviceId=` | `CATALOG` |
| `/encyclopedia` | `awsServiceCatalog.ts` | — |

**ビルド時に本番APIを叩く**ため、API が落ちているとビルドが失敗する/内容が欠ける。

> 方針メモ: 「アプリ導線のない独立SEOページは作らない」（2026-07-22 に `/compare` を撤去した際の教訓）。
> 上記のページはすべてアプリ内から辿れる導線を持つこと。

---

## 5.13 デザインルール（`CLAUDE.md` の要約）

実装時は必ず `CLAUDE.md` の原文を参照すること。要点のみ:

- テキストを含むボタンは `src/components/ui/Button.tsx` を使う（`primary` / `outline` / `danger`）
- ページの枠は `PageLayout` で包む（左右・上下余白と最大幅960pxを一元管理）
- 余白・フォントサイズ・影・角丸は `src/index.css` のトークン（`--spacing-*` / `--font-size-*` /
  `--box-shadow-*` / `--border-radius-*`）を使う。**スケール外の生px値は禁止**
- 画面種別の指示（「Web版」「スマホ版」）は該当ブランチにのみ適用する
