# 01. サービス概要

## 1.1 これは何か

**無限ノック**（https://mugenknock.com）は、AWS 認定資格の演習問題を無限に解けるWebアプリケーション。
問題は AI（Claude）が夜間バッチで自動生成し、別の AI 検証ゲートを通過したものだけが出題される。

- 提供形態: Webのみ（Next.js 静的エクスポート / Cloudflare Pages）
- 対応言語: 日本語・英語（i18n あり。実データは日本語が主）
- 収益: Google AdSense（`src/components/ui/AdPlaceholder.tsx`）
- 登録数: 問題 約 4,900 件（`Questions` テーブル・2026-09 時点）

### プロダクト原則（`docs/website-manifest.txt` より）

作者が明文化した判断基準。**設計判断に迷ったらここに戻る。**

1. 対象は **IT資格の初学者**
2. 既存アプリの不満＝「問題文・解説をカジュアルにコピペできない」「テキスト主体なのに重い」
3. 作りたいもの＝**軽く動いて質の高い問題を演習できるアプリ。冗長な演出はなし。**
4. デザイン＝シンプル、Turquoise ブルー基調＋オレンジのアクセント（AWS マネジメントコンソール風）
5. 品質担保＝**定期的に AI に問題をチェックさせる**

> この原則が「コピーボタンが各所にある」「AIへの質問プロンプト生成メニューがある」
> （`src/views/ExerciseSession.tsx` の `CopyButton` / `PromptMenu`）という実装の理由になっている。

## 1.2 対応する資格（カード）

`src/constants.ts` の `EXAM_TYPES` が唯一の正。全 16 種。

| レベル | 表示名 | 種別 |
|---|---|---|
| Foundational | 基礎 | `CLF`, `AIF` |
| Associate | アソシエイト | `SAA`, `DVA`, `SOA`, `DEA`, `MLA` |
| Professional | プロフェッショナル | `SAP`, `DOP` |
| Specialty | 専門知識 | `AIP`, `ANS`, `SCS` |
| **Additional** | **「オリジナル」** | `ML`, `DB`, `NW`, `SEC` |

### Additional レベル（非AWS）

`NON_AWS_EXAM_TYPES = {ML, DB, NW, SEC}`。AWS 認定ではなく、**各AWS資格が前提とする AWS 外の土台知識**
（機械学習 / データベース / ネットワーク / セキュリティ）を補う独自カード。

- 内部レベルキーは `'Additional'`、UI 表示は `levelLabel()` が「オリジナル」に変換する
- **問題文に AWS サービス名を出さない**（AWS 非依存の前提知識を問うため）
- 判定は `isNonAwsExam(examType)` を使う

### 資格ごとの設定

`EXAM_CONFIGS`（問題数・制限時間）、`PASS_SCORES`（スケールスコア合格ライン 100〜1000）、
`PASS_RATE`（演習モードの合否判定に使う正答率の目安）、`DOMAIN_WEIGHTS`（ドメイン別出題比率）が
すべて `src/constants.ts` に定義されている。

出題ドメインの単一マスタは **`src/data/examDomains.json`**。
`lambda/src/examDomains.json` は従属コピーで、`scripts/deploy-lambda.sh` が
ZIP 作成前にマスタから上書きする。夜間バッチは環境変数 `EXAM_DOMAINS_JSON_PATH` 経由で
マスタを直接読む。**編集するのは常にマスタ側**。

## 1.3 ゲスト / ログインの機能境界（重要）

**迷ったらログイン専用にする。** 詳細は `CLAUDE.md` に規定があり、本ドキュメントはその根拠を補う。

| | ゲスト（未ログイン） | ログイン |
|---|---|---|
| 演習を解く | ✅ | ✅ |
| その場の採点結果（Result） | ✅ | ✅ |
| 図鑑・チートシート閲覧 | ✅ | ✅ |
| ブックマーク | ❌ | ✅ |
| 解答/誤答履歴・フィルタ | ❌ | ✅ |
| 統計・苦手分析・予想スコア | ❌ | ✅ |
| しっかり対策（Focused）モード | ❌ | ✅（30問解答で解放） |
| ポイント・図鑑の解放 | ❌ | ✅ |

**理由**: ゲストのローカル累積は不整合の温床（問題IDの入れ替わりで壊れる・localStorage 肥大化）であり、
ログインの価値も薄れる。実装上は `{user && ...}` / 早期リターンで分岐する。

ゲストの `userId` は文字列リテラル `'guest'` として扱われる（`user?.userId ?? 'guest'`）。
`utils/*.ts` の各同期関数は `userId === 'guest'` を早期リターンの条件にしている。

## 1.4 用語集

| 用語 | 意味 | コード上の表現 |
|---|---|---|
| **カード** | 資格1種を指すUI上の呼称 | `examType` (`'SAA'` 等) |
| **ドメイン** | 試験の出題分野 | `domain`（**整数 index**。`EXAM_DOMAINS[examType][domain]` が表示名） |
| **tagId** | ドメインの正準キー | `` `${examType}_${index}` `` 例: `SAA_0` |
| **サクッと演習 (quick)** | ホームの主モード。少問数・即時採点 | `isQuick: true` |
| **しっかり対策 (focused)** | 蓄積成績で重み付け出題。30問解答で解放 | `isFocused: true` |
| **演習 (practice)** | トレーニング画面から条件を指定して開始 | `mode: 'exercise'` |
| **模試 (exam)** | 本番形式・時間制限あり | `mode: 'exam'` |
| **ミニ模試 (mini)** | 模試の短縮版 | `isMini: true` |
| **ドラフト** | 中断した演習の再開用データ | `localStorage` の `*Draft_<uid>` + サーバ `Sessions.draft` |
| **日めくり / 今日のサービス** | 1日1つ AWS サービスを解放するガチャ的機能 | `DailyServices` テーブル |
| **図鑑** | 解放済みサービスのコレクション画面 | `EncyclopediaUnlocks` テーブル |
| **予想スコア** | ドメイン別正答率を公式配点で加重した 0〜1000 の推定点 | `estimatedScore`（`Home.tsx`） |
| **検証ゲート** | `validityCheckedAt` が無い問題は出題されない | `!q.isHidden && !!q.validityCheckedAt` |

### 「4つの演習種別」

セッションは4種類が**互いを消さず独立して**保存・再開できる。これは意図的な設計で、
中断中の模試を残したままサクッと演習を始められる。

```
quick    → localStorage: quickExerciseDraft_<uid>     / Sessions.sessionType='quick'
focused  → localStorage: focusedExerciseDraft_<uid>   / Sessions.sessionType='focused'
practice → localStorage: practiceExerciseDraft_<uid>  / Sessions.sessionType='practice'
exam     → localStorage: examDraft_<uid>              / Sessions.sessionType='exam' | 'mini'
```

`utils/sessionUtils.ts` の `autoScoreAndClearDrafts(userId, keys)` は **必ず自分の種別のキーだけ**渡すこと。
未指定だと演習3種すべてを確定してしまう（後方互換のための既定値）。

## 1.5 品質担保の考え方

問題は「生成して終わり」ではなく、複数の夜間ジョブが多段でチェックする。

```
01-generate-questions   問題を生成 → Questions に投入（validityCheckedAt なし＝まだ非公開）
02-check-validity       事実正確性を検証 → OK なら validityCheckedAt を付与（＝公開される）
09-check-linebreaks     体裁（改行のみ）を Haiku で整形。非空白文字の変化は機械的に破棄
03-check-reports        ユーザー通報を精査し ok/fix/delete を判定
audit-questions         生成済み問題を監査し、生成・検証プロンプト自体を自動改良
```

**`validityCheckedAt` が出題プールへの唯一の入場券**である点が全体を貫く不変条件。
`GET /questions` は常に `!q.isHidden && !!q.validityCheckedAt` でフィルタする。

詳細は [07-operations.md](07-operations.md)。
