# オリジナル資格(前提知識)問題を公式資格の出題プールへ既定で混在 — 実装タスク

上から順に実装する。1タスク = 1コミットを目安にする。

## 実装

- [x] 1. Lambda: `COMPANION_EXAM` 定義、`domainBalancedOrder`/`selectionOrder`/
      `answeredPerDomain` のバケットキーを `${examType}:${domain}` の複合キー化
- [x] 2. Lambda: `GET /questions` に `includeCompanion` 対応（`domain`指定時は無視）
- [x] 3. Lambda: `GET /users/me/question-status` に `includeCompanion` 対応
- [x] 4. Frontend: `src/constants.ts` に `COMPANION_EXAM` を追加
- [x] 5. Frontend: `Home.tsx` サクッと演習に `includeCompanion` prefs・チェックボックス・
      パラメータ付与
- [x] 6. Frontend: `Home.tsx` しっかり対策に同上
- [x] 7. Frontend: `Practice.tsx` 演習タブに同上（模試タブは touch しない）
- [x] 8.（2026-09-16追加）`src/utils/domainStats.ts` の `recordSessionDomainStats` を
      「回答した問題自身の examType」でグループ化するよう修正。修正前は companion 問題への
      回答がセッションの target examType の tagId に誤って記録され、(a) target側の統計を
      汚染し (b) companion自身の統計に反映されない、という二重の不具合があった

## テスト

- [x] 手動で受入条件（spec.md）を確認（curlでのAPI検証。ブラウザ手動確認は開発サーバで進行中）

## デプロイ

- [x] `./scripts/deploy-lambda.sh dev`
- [ ] develop へ push
- [ ] Cloudflare Pages のビルド完了を確認
- [ ] 検証環境で受入条件をすべて確認

## クローズ

- [x] `docs/06-exercise-logic.md`・`docs/04-api.md`・`docs/05-screens.md`・
      `CLAUDE.md` を更新（**必須**）
- [ ] `spec.md` の状態を「完了（YYYY-MM-DD）」に更新
- [ ] 想定と違ったこと・学んだことを下に記録

## 実装後のメモ

- 当初「ドメイン別統計への不算入は tagId が問題自身の examType を基準にしているため
  追加実装なしで成立する」と見込んでいたが、これは `GET /users/me/question-status` 等の
  **読み取り**経路の設計であり、`recordSessionDomainStats`（**書き込み**経路）は
  セッションの target examType を全回答に一律適用していたため実際には成立していなかった。
  読み取り経路の設計を見て書き込み経路も同じだろうと**確認せずに推測**したのが原因。
  ユーザーからの「オリジナル資格側の成績データを見たら反映されているはず」という
  指摘で発覚（2026-09-16）。

