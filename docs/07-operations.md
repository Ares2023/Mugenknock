# 07. 運用・自動化

**この章の内容は AWS 上ではなく開発者のローカルPC（WSL2）で動いている。**
`prompts/` は `.gitignore` 対象（ただし履歴上は追跡済み）で、ローカル運用専用。

## 7.1 全体像

```
                  ~/.config/mugenknock/next_ping        ← 唯一の正（次回ピン時刻）
                                │
                  sync-local-schedule.sh 読む
                                │
   ┌────────────┬───────────────┼───────────────┬────────────────┐
   ▼            ▼               ▼               ▼                ▼
hook-1       hook-2          localping       postping      （常設タイマー）
(ピン30分前)  (ピン15分前)     (ピン時刻)      (ピン+10分)     canary 23:50
問題生成      妥当性検証       claude を起こす  再同期＋夜間     mode-reset 土03:00
01-generate  02-check-validity /usage で次回   バッチ           chainwatch
                               時刻を再計算
```

- すべて **one-shot 絶対時刻タイマー**（`Persistent=true`）。PC停止中に逃した発火は次回起動時に走る
- **連鎖構造**: postping が `sync-local-schedule.sh` を呼んで次サイクルを仕込む
- 連鎖が切れると全部止まるので `chain-watchdog.sh` が保険で監視する

### なぜこの構成か

Claude のサブスクリプションは5時間単位でトークンが回復する。
**回復直前に残量を使い切る**のが最も効率的なので、ピン（＝回復時刻）の
30分前・15分前にフックを仕込んでトークンを消化している。これは意図的な設計。

以前は Fargate + EventBridge でこれを回していたが、課金を避けるため
**Fargate はピンのみ→2026-09にローカル systemd へ全面移行**した。

## 7.2 systemd user タイマー

`systemctl --user list-timers` で確認できる。

| ユニット | 起動 | 実行内容 |
|---|---|---|
| `mugenknock-localping` | 次回ピン時刻 | `local-ping-run.sh` — claude を起こし、`/usage` から次回時刻を決めて再アーム |
| `mugenknock-hook-1` | ピン30分前 | `local-hook-run.sh` — 問題生成（`01-generate-questions --hard`） |
| `mugenknock-hook-2` | ピン15分前 | `local-hook2-run.sh` — 妥当性検証（`02-check-validity`） |
| `mugenknock-postping` | ピン+10分 | `local-postping-run.sh` — 再同期 ＋ 夜間サイクルなら夜間バッチ |
| `mugenknock-canary` | 毎日 23:50 | Playwright カナリアテスト → S3 |
| `mugenknock-nightly-noai` | 毎日 00:05 | AI 不要の夜間処理 |
| `mugenknock-mode-reset` | 土 03:00 | `ct` のモードを既定へ戻す |
| `mugenknock-chainwatch` | 定期 | 連鎖切れの検知・修復 |

### 制御コマンド `ct`（`scripts/ct.sh`）

```bash
ct              # 状況表示
ct on / off     # フック（hook/hook2/夜間バッチ）の有効・無効。ピンは常時
ct set HH:MM    # 次回ピン時刻を変更（以降は /usage の回復時刻に自動追従）
ct cancel       # 完全停止（ピンも止める）
ct resume       # 再開（次回 = now+5h）
ct sync         # 時計に合わせてタイマー再同期
ct skip         # 次回のフックだけスキップ
ct run          # 今すぐピン実行
ct log [-f|-n|-d DATE]
ct hooks list / add <分前> <スクリプト> [ラベル] / rm <#>
```

フラグファイル:
- `~/.config/mugenknock/ping_disabled` — `ct cancel`（完全停止）
- `~/.config/mugenknock/hooks_enabled` — `ct on/off`（フックのみ切替）
- `~/.config/mugenknock/hooks.conf` — フック定義（`分前|スクリプト|ラベル`）。`ct` と `sync` が共用

### 状態の同期（S3）

バケット `mugenknock-fargate-state-<accountId>`。

| プレフィックス | 内容 |
|---|---|
| `creds/` | Claude のサブスクリプション OAuth 認証情報（**APIキーではない**） |
| `state/` | 各夜間スクリプトの進捗状態（`claimed.json`, `service-catalog.json` 等） |
| `instructions/` | 資格別の問題生成指示（`refresh-exam-guide.sh` が更新） |
| `meta/` | `.last_run` / `.last_run_date` / `.claude_history` / `.night_history` |

各スクリプトは **pull → 実行 → push** で同期する。
`creds` は「`expiresAt` が新しい方を残す」スマート同期（フレッシュなローカルを古いS3で潰さない）。
`.last_run_date` は二重実行防止の要なので盲目上書きしない。

## 7.3 夜間バッチ

`prompts/night-scripts.list` が実行順の唯一の正。形式は `遅延分数,フルパス`。

| 遅延 | スクリプト | 内容 | claude |
|---|---|---|---|
| 0 | `99-send-report.sh` | 日次稼働レポートをメール送信 | ✅ |
| 0 | `generate-release-note.sh` | 前日のgitコミットからリリースノート生成 → `Releases` | ✅ |
| 0 | `check-scheduled-deletions.sh` | 予約削除日を過ぎた問題を削除 | ❌ 決定的 |
| 15 | `03-check-reports.sh` | ユーザー通報の精査（ok/fix/delete + 関連問題） | ✅ |
| ~~15~~ | ~~`02-check-validity.sh`~~ | **一時停止中**（2026-06-29〜・トークン枯渇のため） | ✅ |
| ~~20~~ | ~~`01-generate-questions-hard.sh`~~ | **一時停止中**（同上） | ✅ |
| 40 | `refresh-exam-guide-monthly.sh` | 公式試験ガイドの更新（30日以内はスキップ） | ✅ WebFetch |
| 45 | `refresh-service-catalog-monthly.sh` | サービスカタログ更新（30日以内スキップ・`-n 12` で有界） | ✅ WebFetch |
| 50 | `05-check-daily-services.sh` | 日めくり記事の廃止照合＋体裁チェック | 一部 ✅ |
| 55 | `04-generate-daily-services.sh` | 日めくり記事の生成 | ✅ |
| 58 | `09-check-linebreaks.sh` | 改行整形（Haiku） | ✅ |
| 60 | `audit-questions-nightly.sh` | 問題品質監査＋**生成/検証プロンプトの自動改良** | ✅ opus |
| 65 | `canary-coverage-check.sh` | カナリアtestとサイト構成の整合性チェック・spec自動更新 | ✅ opus |

> **01/02 が一時停止中**である点に注意。再開するには `night-scripts.list` の該当2行の
> 先頭 `#` を外す。ただし01/02は hook-1 / hook-2（ピン前）でも走っているため、
> 夜間バッチからは外して**フック側に寄せている**というのが現在の構成。

### 問題の品質ゲート

```
01-generate-questions   生成 → Questions に投入（validityCheckedAt なし = 非公開）
        ↓
02-check-validity       事実正確性を検証
        ├ 問題なし → validityCheckedAt を付与（= 公開される）
        ├ 問題あり → 自動修正 or fixProposalJson を残す
        └ 致命的   → DB から削除
        ↓
09-check-linebreaks     改行のみ整形（Haiku）
        └ 非空白文字が1文字でも変化したら fix を破棄（決定的ガード）
        ↓
audit-questions         監査。事実誤りではない指摘（易しすぎ・模試不適）は
                        auditNote に記録 → 管理画面「スキャン結果」で人が判断
                        systemic な問題があれば 01/02 のプロンプト自体を最小限追記で改良
```

### 検証（02）の方針

**本質（事実・正確性・整合）に集中し、体裁は無視する**（トークン削減）。
体裁は 09（Haiku）が担当。ただし**選択肢長（正解が最長にならないようにする）のルールは継続**。
この方針は自動改良（audit の `-i`）で崩されないよう明示されている。

### 通報チェック（03）の多層防御

ユーザー通報は攻撃面になり得るため:

1. **ブロックリスト** — `report-blocklist.txt` の userId は入口で破棄
2. **コメント無害化** — デリミタ突破除去・長さ制限のうえ「信頼できない手掛かり」として提示
3. **モデル権限ゼロ** — claude を `--tools ""` で起動（ファイル/コマンド/UIへのアクセス不可）
4. **適用スコープ限定** — 書込みは提示 questionId の問題内容5フィールドのみ
5. **暴走遮断** — 1実行あたりの削除数に上限（`REPORT_MAX_DELETES`）

### トークン運用

- 夜間バッチのスループットは**トークン律速**。並列化は不可、チャンク拡大とツール制限で効率化する
- 監査は `n=15 / c=8`（opus 呼び出し2回/晩）。以前は `n=30 / c=5`（6回/晩）で消費が大きかった
- 水曜早朝、週間トークン使用率が50%以下なら `ct on`（使い切りモード）へ自動切替。
  土曜03:00 の `mode-reset` で戻る
- 生成は安く、**検証ゲートにだけ WebFetch を残す**方針

## 7.4 デプロイ・確認スクリプト

| スクリプト | 用途 |
|---|---|
| `scripts/deploy-lambda.sh [dev\|prod]` | Lambda デプロイ（引数なしはブランチから判定） |
| `prompts/night-prompts/scripts/cf-deploy-status.sh [prod\|staging\|wait]` | Cloudflare Pages のビルド状況。`wait` で完了待ち |
| `prompts/night-prompts/scripts/cf-usage.sh` | Cloudflare の使用量 |
| `prompts/night-prompts/scripts/backend-health-check.sh` | API の疎通確認 |
| `scripts/backup-devenv.sh` | 開発環境のバックアップ |
| `scripts/backfill-question-accuracy.sh` | `globalAttempts`/`globalCorrect` の補正 |

Cloudflare API トークンは `~/.bashrc` の `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` から読む。

> Web Analytics は Pages 用トークンでは取れない。`Account Analytics:Read` の別トークン + GraphQL が必要。

## 7.5 E2E テスト（Playwright）

```bash
npm run e2e            # 検証環境でカナリア（認証不要）
npm run e2e:canary:prod # 本番でカナリア
npm run e2e:local      # localhost:3000
npm run e2e:noauth     # 認証不要テストのみ
npm run e2e:visual     # スクリーンショット比較
npm run e2e:ui         # Playwright UI モード
npm run e2e:report     # HTML レポート表示
```

### プロジェクト構成（`playwright.config.ts`）

| project | 対象 | 認証 |
|---|---|---|
| `setup` | `*.setup.ts` | ログインして `e2e/.auth/user.json` を作る |
| `chromium` | Desktop Chrome | storageState 使用 |
| `mobile-chrome` | Pixel 7 | storageState 使用 |
| `no-auth` | `*.noauth.spec.ts` | なし（カナリア用スモーク） |

`workers: 1`（認証状態の競合を防ぐため直列）。ロケール `ja-JP` / TZ `Asia/Tokyo`。

### カナリア

`mugenknock-canary.timer` が毎日23:50に**ローカル**で実行し、結果を
S3 `mugenknock-error-logs/canary-logs/` にアップロードする。
日次レポート（`99-send-report.sh`）は**S3の最新結果を読む**（実行はしない）。

> ローカル実行なのは、夜間バッチを動かす環境に Playwright を同梱していないため。

`canary-coverage-check.sh` が「現在のサイト構成とカナリアspecの整合性」を opus で確認し、
カバー漏れがあれば `playwright --list` の検証ゲート付きで spec を自動更新する。

## 7.6 日次レポート

`99-send-report.sh` が Gmail SMTP でメール送信する。設定は `~/.mugenknock_mail.conf`
（`SMTP_USER` / `SMTP_PASS`（アプリパスワード）/ `SMTP_TO`）。

内容:
1. 前日夜間スクリプトの成果サマリー（生成数・検証数）
2. カナリアテスト結果（S3 の最新）
3. AWS資格公式情報の変更チェック（WebFetch）
4. サイト稼働状況（問題数・未検証数・未解決通報数）

二重送信は S3 マーカーで冪等化されている。

## 7.7 トラブルシューティング

| 症状 | 確認すること |
|---|---|
| 夜間バッチが動いていない | `systemctl --user list-timers` で `Trigger: n/a` が無いか。`ct sync` で張り直す |
| メールが来ない | 上と同じ（連鎖切れが最も多い原因）。`chain-watchdog.sh` のログも見る |
| リリースノートが生成されない | **529 エラーは自己修復されない。** 手動で `generate-release-note.sh <日付>` を再実行する |
| 管理画面の変更が出題に反映されない | Lambda のウォームキャッシュ（最大10分）。[02-architecture.md](02-architecture.md) 2.7 |
| 本番だけ挙動が古い | `deploy-lambda.sh prod` を打ち忘れていないか |
| ドメイン配分が偏る | prod Lambda に `domainBalancedOrder` が入っているか実機確認 |
