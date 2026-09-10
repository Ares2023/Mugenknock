# 無限ノック（mugenknock）

AWS 認定資格の演習問題を無限に解ける Web アプリケーション。
問題は AI が夜間バッチで自動生成し、別の AI 検証ゲートを通過したものだけが出題される。

- 本番: https://mugenknock.com
- 対応資格: 16カード（AWS認定12種 + 前提知識を補う独自カード4種）
- 問題数: 約 4,900 件

## ドキュメント

**実装に着手する前に読むこと。**

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 開発時に守るルール（デプロイ手順・デザイン規約・確定方針） |
| [`docs/`](docs/README.md) | 現状の実装仕様（アーキテクチャ・API・データモデル・画面・運用） |
| [`specs/`](specs/README.md) | これから作るものの仕様（機能単位） |
| [`docs/website-manifest.txt`](docs/website-manifest.txt) | 制作意図・哲学（判断に迷ったときの最上位基準） |

## セットアップ

```bash
npm install
```

`.env.local` を作成する（gitignore 済み）:

```
NEXT_PUBLIC_API_ENDPOINT=https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev
```

```bash
npm run dev     # http://localhost:3000
```

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 静的エクスポート（出力先 `out/`） |
| `npm run e2e` | 検証環境に対するカナリアテスト |
| `npm run e2e:local` | ローカル開発サーバーに対する E2E |
| `npm run e2e:report` | Playwright の HTML レポート表示 |
| `./scripts/deploy-lambda.sh dev` | Lambda を検証環境へデプロイ |
| `./prompts/night-prompts/scripts/cf-deploy-status.sh wait` | Cloudflare Pages のビルド完了を待つ |
| `ct` | 夜間バッチのスケジュール管理（ローカル運用） |

> `npm test` は未設定（ユニットテストは未導入。[`docs/08-refactor-plan.md`](docs/08-refactor-plan.md) の A-3 参照）。

## デプロイ

作業ブランチは常に `develop`。push すると Cloudflare Pages が検証環境を自動ビルドする。

```bash
git push github develop
./prompts/night-prompts/scripts/cf-deploy-status.sh wait
```

**`lambda/` を変更した場合は `deploy-lambda.sh` で別途デプロイが必要。**
`git push` では Lambda は一切更新されない。

本番リリース（`master` へのマージ）は**ユーザーの明示的な指示があるときのみ**行う。
詳細は [`CLAUDE.md`](CLAUDE.md) の「ブランチ・デプロイルール」。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 15 + React 19 + TypeScript（Static Export） |
| ホスティング | Cloudflare Pages |
| バックエンド | API Gateway + Lambda (Node.js / express) |
| DB | DynamoDB |
| 認証 | AWS Amplify Gen2（Cognito） |
| E2E | Playwright |

構成の詳細は [`docs/02-architecture.md`](docs/02-architecture.md)。
