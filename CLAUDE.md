# プロジェクトルール

## 画面種別の指示の適用範囲

指示に画面種別が明示されている場合は、その画面にのみ適用する。

| 指示の表現 | 適用対象 |
|---|---|
| 「Web版」「デスクトップ」「PC版」 | デスクトップ（`!isMobile` ブランチ）のみ |
| 「スマホ版」「モバイル」「スマホ」 | モバイル（`isMobile` ブランチ）のみ |
| 画面種別の指定なし | 両方に適用 |

### ブレークポイント
- モバイル：`window.innerWidth < 768`（`isMobile === true`）
- デスクトップ：`window.innerWidth >= 768`（`isMobile === false`）

### 実装の注意点
- モバイル限定の変更は `{isMobile && ...}` または `isMobile ? ... : ...` で分岐する
- デスクトップ限定の変更は `{!isMobile && ...}` または `!isMobile ? ... : ...` で分岐する
- 両方に適用する変更はブランチを分けずに共通のスタイル・ロジックとして実装する

---

## 環境構成

| 環境 | Gitブランチ | フロントエンド URL | バックエンド Lambda | API エンドポイント |
|------|------------|-----------------|-------------------|-----------------|
| **検証（ステージング）** | `develop` | Cloudflare Pages preview URL | `awsquizHandler-dev` | `.../dev` |
| **本番** | `master` | https://mugenknock.com | `awsquizHandler-prod` | `.../prod` |

- API Gateway: `a0q3656qw4`（ap-northeast-1）。ステージ変数 `lambdaFn` で Lambda を切り替える
- DynamoDB: 両環境で共通テーブルを使用
- フロントエンド: **Next.js 15 + Cloudflare Pages（Static Export）**
- Cloudflare Pages ビルド設定: Build command = `npm run build`, Output dir = `out`

### 環境変数の切り替え（Cloudflare Pages ダッシュボード設定）
ビルド時の `NEXT_PUBLIC_API_ENDPOINT` は Cloudflare Pages の環境変数で分岐する。

| Cloudflare Pages 環境 | `NEXT_PUBLIC_API_ENDPOINT` |
|----------------------|--------------------------|
| Production（master） | `https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/prod` |
| Preview（develop 等）| `https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev` |

ローカル開発は `.env.local`（gitignore 済み）で dev エンドポイントを指定する。

---

## ブランチ・デプロイルール

### 基本方針
- **作業ブランチは常に `develop`**。ファイル編集・コミットはすべて `develop` で行う。
- **実装完了後は `develop` にプッシュして検証環境で確認する。**
  ビルドは Cloudflare Pages 側でほぼ無料なので、変更のたびに push してよい。
- **`master` ブランチへのマージ・プッシュは、ユーザーから明示的な指示があった場合のみ。**
  「本番にリリース」「master にマージ」などの指示がない限り絶対に行わない。
- セッション開始時に `git branch` で現在のブランチを確認し、`develop` でなければ `git checkout develop` してから作業を始める。

### リモートリポジトリ

| リモート名 | URL | 用途 |
|-----------|-----|------|
| `github` | `git@github.com:Ares2023/Mugenknock.git` | GitHub（Cloudflare Pages 連携・**メイン**） |
| `origin` | `codecommit::ap-northeast-1://aws-quiz-app` | AWS CodeCommit（バックアップ） |

- **プッシュは `github` を優先**。`origin`（CodeCommit）にも同時にプッシュする。

---

## 開発フロー

### 通常の開発（フロントエンドのみ変更）
```
1. develop ブランチで作業・ファイル編集
2. git add / git commit
3. git push github develop   # Cloudflare Pages が検証環境を自動ビルド・デプロイ
4. git push origin develop   # CodeCommit にもバックアップ
5. ./prompts/night-prompts/manual/cf-deploy-status.sh wait   # ビルド完了を待って結果確認
```

### Lambda も変更した場合
```
1. develop ブランチで作業・ファイル編集
2. ./scripts/deploy-lambda.sh        # develop → awsquizHandler-dev に自動デプロイ
3. git add / git commit
4. git push github develop
5. git push origin develop
6. ./prompts/night-prompts/manual/cf-deploy-status.sh wait   # ビルド完了を待って結果確認
```

### 本番リリース（ユーザーから明示的な指示があった場合のみ）
```
1. git checkout master
2. git merge develop
3. git push github master            # Cloudflare Pages が本番を自動ビルド・デプロイ
4. git push origin master
5. ./scripts/deploy-lambda.sh prod   # Lambda も本番に反映
6. ./prompts/night-prompts/manual/cf-deploy-status.sh wait   # ビルド完了を待って結果確認
7. git checkout develop              # 作業ブランチを戻す
```

### Lambda デプロイスクリプト
- スクリプト: `./scripts/deploy-lambda.sh`
- 引数なし: 現在のブランチを見て自動判定（develop→dev、master→prod）
- `./scripts/deploy-lambda.sh dev`: 強制的に dev へデプロイ
- `./scripts/deploy-lambda.sh prod`: 強制的に prod へデプロイ

### Lambda 更新ルール（重要）
- **Lambda は `awsquizHandler-dev` と `awsquizHandler-prod` の2つが独立**している。Lambda コードを変更したら、原則 **dev と prod の両方をデプロイする**こと（`deploy-lambda.sh` を dev・prod それぞれ実行）。
- **`git push` では Lambda は一切更新されない。** push は Cloudflare のフロントビルドのみ。Lambda は必ず `deploy-lambda.sh` で手動デプロイする。
- 各 Lambda の利用者:
  - **`awsquizHandler-prod`（/prod）**: 本番 mugenknock.com。**加えて現状は検証(develop preview)のフロントも /prod を叩く**（`.env.production` が全ビルドで効くため）。デプロイ済みフロントは両環境ともこれを使用。
  - **`awsquizHandler-dev`（/dev）**: ローカル開発（`.env.local`）と**夜間スクリプト**（`01-generate-questions.sh` 等の問題生成・取込）。
- したがって **prod だけ更新すると夜間生成・ローカルが旧コード / dev だけ更新すると本番が旧コード**になる。推奨は「dev に出して検証 → prod に反映」の二段で両方更新。
- DynamoDB は dev/prod 共通テーブルのためデータは同じ。dev/prod Lambda の違いは「どちらのコードで処理するか」だけ。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 15 + React 19 + TypeScript（Static Export） |
| ホスティング | Cloudflare Pages |
| バックエンド | AWS API Gateway + Lambda（Node.js） |
| DB | Amazon DynamoDB |
| 認証 | AWS Amplify（Cognito） |
| AWS CLI | `/home/yuzuki/local/bin/aws`（グローバル未インストール） |

### ディレクトリ構成メモ
- `app/` — Next.js App Router のルート定義（page.tsx は薄いラッパー）
- `src/views/` — 実際の画面コンポーネント（旧 src/pages/ からリネーム済み）
- `src/compat/react-router-dom.tsx` — React Router v6 → Next.js App Router 互換レイヤー
- `src/compat/react-helmet-async.tsx` — Helmet → Next.js metadata 互換スタブ

### compat レイヤー使用上の注意
- **`useNavigate(-1)` は `router.back()` に変換済み**（数値デルタ対応）
- **`useLocation().state`** は同一レンダーサイクルで複数回呼んでも安全（モジュールキャッシュ実装済み）
- **`useLocation().hash`** は `window.location.hash` を返す
- **`useParams()`** は常に `{}` を返す。URL パラメータが必要なページは `app/.../page.tsx` から props として渡すこと（`app/sample/[exam]/page.tsx` → `SampleQuiz` の実装例を参照）

---

## アイコンの取得先

### UIアイコン（Lucide）
- Lucide（https://lucide.dev/icons/）からSVGパスを取得してコンポーネント化する
- 定義場所：`src/components/Icons.tsx`

### AWSサービスアイコン（`public/icons/aws/`）
- **形式**：80×80px SVG（優先） + 64×64px PNG（フォールバック）
- **SVG入手元**：https://github.com/weibeld/aws-icons-svg
- **PNG入手元**：AWS公式アーキテクチャアイコン ZIP（https://aws.amazon.com/architecture/icons/）
- **表示ロジック**：`ServiceIconImg`（`src/components/Icons.tsx`）がSVGを優先しPNGにフォールバック
- **新しいサービスを追加する際**：SVGとPNGの両方を配置し、`awsServiceCatalog.ts` の `icon` フィールドに設定する

---

## ボタンデザインルール

### Buttonコンポーネント（`src/components/ui/Button.tsx`）
テキストを含むボタンはすべて `<Button>` コンポーネントを使う。

| variant | 用途 | 見た目 |
|---|---|---|
| `primary`（デフォルト） | 画面内で最も重要な1つのアクション | オレンジ塗りつぶし |
| `outline` | 補助アクション・キャンセル・ナビゲーション | 青枠・透明背景 |
| `danger` | 削除・破壊的操作の確定 | 赤塗りつぶし |

| size | padding | 用途 |
|---|---|---|
| `sm` | 4px 12px | モーダル内の小さなアクション |
| `md`（デフォルト） | 8px 20px | 通常のボタン |
| `lg` | 12px 24px | 目立たせたい主要アクション |

- `borderRadius` はすべて `var(--border-radius-full)`（pill形）で固定
- `fullWidth` prop で横幅100%になる
- インラインstyleでvariantの色を上書きしない

### ネイティブ `<button>` 要素の許容範囲
以下の用途に限りネイティブ `<button>` をインラインスタイルで直接書いてよい。それ以外は `<Button>` を使う。

- アイコン専用ボタン（テキストなし）
- モーダルの ✕ 閉じるボタン
- 設定項目行（SettingsRow）・選択肢など、リスト内の特殊なクリッカブル要素

### アイコン専用の円形ボタン
- 最小サイズ：`width: 44, height: 44`（タッチターゲット確保）
- 形状：`borderRadius: '50%'`
- 枠線：`border: '1px solid var(--color-border)'`（背景なし）
- コンポーネント化はしない（各所でインライン定義でよい）

---

## 余白・間隔・サイズの標準（デザイントークン必須）

画面間のデザイン不統一を防ぐため、**余白・gap・padding・フォントサイズ・影・角丸はインラインの生px値を避け、必ず `src/index.css` のトークンを使う**。

### スペーシングスケール（4px基準）
`gap` / `margin` / `padding` はこのスケールのトークンのみ使う。`10px` `7px` `14px` `6px` `5px` `13px` など**スケール外の生px値は禁止**（最も近いトークンに丸める）。

| トークン | 値 | 主な用途 |
|---|---|---|
| `--spacing-xs` | 4px | アイコンとテキストの隙間など最小単位 |
| `--spacing-sm` | 8px | 密なリスト・チップ間 |
| `--spacing-md` | 16px | カード内padding・要素間の標準 |
| `--spacing-lg` | 24px | セクション間隔・ページ左右余白 |
| `--spacing-xl` | 32px | ページ上下余白・大きな区切り |

### ページの枠は `PageLayout` を使う（`src/components/ui/PageLayout.tsx`）
各画面が最外周padding・最大幅・センタリングを手書きせず、**`<PageLayout>` で包む**。標準値はトークンで一元管理：

- 左右余白：デスクトップ `24px` / モバイル `16px`
- 上下余白：デスクトップ `32px` / モバイル `16px`
- セクション間隔（`stack` prop）：デスクトップ `24px` / モバイル `16px`
- 最大幅：`960px`（`maxWidth` propで変更、`false` でフル幅）

フルブリード（全幅）にしたいブロックがある画面は `noPaddingX` 等で調整する。

### フォントサイズ
`fontSize` は `var(--font-size-*)` トークンを使い、生数値直書きを避ける。階層：
`3xs:9 / 2xs:10 / xs:11 / sm:12 / sm2:13 / base:14 / md:15 / lg:16 / h3:18 / xl:20 / h2:22 / xxl:28`。
装飾用の特大サイズ（アイコン・絵文字の 24〜108px 等）はトークン化しなくてよい。

### 影（box-shadow）
影は用途別の以下トークンを使い、`0 2px 8px rgba(...)` のような独自値を書かない。

| トークン | 用途 |
|---|---|
| `--box-shadow-sm` | カード（標準） |
| `--box-shadow-md` | 浮いたカード・hover |
| `--box-shadow-pop` | ドロップダウン・ポップオーバー |
| `--box-shadow-lg` | モーダル・ダイアログ |
| `--box-shadow-up` | 画面下部に固定するバーの上向き影 |

### 角丸
`var(--border-radius-sm|md|lg|full)` を使う。`14px` 等の生値は使わない（pill形ボタンは `full`）。
