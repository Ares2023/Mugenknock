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

## ブランチルール

- **作業ブランチは常に `develop`**。ファイル編集・コミット・プッシュはすべて `develop` ブランチで行う。
- **`master` ブランチへの変更は禁止**。ユーザーから明示的に「master にマージして」「本番リリースして」などの指示があった場合のみ操作してよい。
- **明示的な指示がない限り、`develop`・`master` ブランチへのプッシュおよびマージは行わない。** Amplify の自動ビルドが発動して課金が増えるため。すべての実装が完了した後、「プッシュして」「マージして」などの指示を受けてから実行すること。
- セッション開始時に `git branch` で現在のブランチを確認し、`develop` でなければ `git checkout develop` してから作業を始める。

## 環境構成

| 環境 | Gitブランチ | フロントエンド | バックエンド Lambda | API エンドポイント |
|------|------------|--------------|-------------------|-----------------|
| ステージング | `develop` | Amplify（developブランチ自動デプロイ） | `awsquizHandler-dev` | `.../dev` |
| 本番 | `master` | Amplify（masterブランチ自動デプロイ） | `awsquizHandler-prod` | `.../prod` |

- API Gateway: `a0q3656qw4`（ap-northeast-1）。ステージ変数 `lambdaFn` で Lambda を切り替える
- DynamoDB: 両環境で共通テーブルを使用
- `amplify push` は使用不可。Lambda は直接デプロイする（下記参照）

## 開発フロー

### 通常の開発（フロントエンドのみ変更）
```
1. develop ブランチで作業・ファイル編集
2. git add / git commit / git push origin develop
   → Amplify がステージング環境を自動ビルド
```

### Lambda も変更した場合
```
1. develop ブランチで作業・ファイル編集
2. ./scripts/deploy-lambda.sh        # develop ブランチ → awsquizHandler-dev に自動デプロイ
3. git add / git commit / git push origin develop
```

### 本番リリース（ユーザーから指示があった場合のみ）
```
1. git checkout master
2. git merge develop
3. git push origin master            # Amplify が本番環境を自動ビルド
4. ./scripts/deploy-lambda.sh prod   # Lambda も本番に反映
5. git checkout develop              # 作業ブランチを戻す
```

### Lambda デプロイスクリプト
- スクリプト: `./scripts/deploy-lambda.sh`
- 引数なし: 現在のブランチを見て自動判定（develop→dev, master→prod）
- `./scripts/deploy-lambda.sh dev`: 強制的に dev へデプロイ
- `./scripts/deploy-lambda.sh prod`: 強制的に prod へデプロイ

## 技術スタック
- React + TypeScript (Create React App)
- AWS Amplify Gen1
- AWS CLI: `/home/yuzuki/local/bin/aws`（グローバルにインストールされていない）

## アイコンの取得先

### UIアイコン（Lucide）
- Lucide（https://lucide.dev/icons/）からSVGパスを取得してコンポーネント化する
- 定義場所：`src/components/Icons.tsx`

### AWSサービスアイコン（`public/icons/aws/`）
- **形式**：80×80px SVG（優先） + 64×64px PNG（フォールバック）
- **SVG入手元**：https://github.com/weibeld/aws-icons-svg （AWS公式アーキテクチャアイコンのミラー）
  - ファイルは `Arch_<ServiceName>_64.svg` のような名前で公開されている
  - ダウンロード後、ファイル名を `public/icons/aws/<DisplayName>.svg` に合わせてリネームする
- **PNG入手元**：AWS公式アーキテクチャアイコン ZIP（https://aws.amazon.com/architecture/icons/）
  - ZIPを展開し、64pxサイズのPNGを取り出してリネームする
- **表示ロジック**：`ServiceIconUrl`（`src/components/Icons.tsx`）がSVGを優先しPNGにフォールバック
  - SVGがない場合は64px PNGが拡大されてぼやけるため、SVGを用意すること
- **新しいサービスを追加する際**：SVGとPNGの両方を配置し、`awsServiceCatalog.ts` の `icon` フィールドに `/icons/aws/<Name>.png` を設定する

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
