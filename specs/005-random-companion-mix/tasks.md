# 公式資格と基礎知識資格の出題割合をランダムにする — 実装タスク

> 進めながら `[ ]` を `[x]` に。

## 実装

- [x] `lambda/src/selection.js` を作り、選定関数を移す（依存ゼロ）
- [x] `interleaveByPool`（残り件数比の抽選マージ）と `companionMixedOrder` を実装
- [x] `selectionOrder` を、フィルタなし・階層ごとに `companionMixedOrder` を使うよう変更
- [x] `app.js` を `require('./selection')` に置き換え、`domainBalancedOrderWithCompanionPriority` を削除
- [x] `lambda/test/selection.test.js` を書く

## テスト

- [x] `node --test lambda/test/` が通る（統計テスト含む）
- [x] 旧実装では統計テストが落ちることを確認（テストが現状の固定挙動を検出できる証明）
- [x] dev Lambda に出し、MLA/AIF/DEA/SCS の先頭 5・10・20・30問の割合を30回ずつ再計測
- [x] フィルタ経路（存在しない userId + `unansweredOnly=true`）で混ざることを実 API で確認
- [x] SAA（基礎知識なし）の出題順が従来と変わらないこと（全問・重複なし）

## デプロイ

- [x] `./scripts/deploy-lambda.sh dev`
- [x] develop に push → ビルド成功まで確認
- [ ] **prod は人間の確認を取ってから** `./scripts/deploy-lambda.sh prod`
- [ ] prod 反映後、実機で割合を再計測（反映漏れ防止）

## クローズ

- [x] `docs/06-exercise-logic.md` §6.1 / §6.2 を更新
- [x] `docs/04-api.md` の `idsOnly` の並び順を更新
- [x] `specs/004` に「項目1は specs/005 に置き換え」を追記
- [x] `CLAUDE.md` の「出題ドメイン配分の方針」に追記
- [x] spec の状態を「完了（日付）」に

## 実装後のメモ

- dev 実測（30回・先頭30問）: MLA 36%/AIF 40%/DEA 28%/SCS 32%（プール比 34.6/40.5/27.4/32.3）。旧 prod は 60/50/60/40% 固定
- フィルタ経路（MLA・未回答）の先頭10問の基礎知識: 旧 0% → 新 35%
- しっかり対策はフロント（`Home.tsx`）でも「フィルタ時は公式を先に抽出」していたため、同じ方針で分岐を除去
  （Lambda だけ直しても、しっかり対策は変わらない）
- 注意: 検証(develop preview)のフロントは /prod Lambda を叩くため、prod 反映までは検証環境で新しい混ざり方は見えない
