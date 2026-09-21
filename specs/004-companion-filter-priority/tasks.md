# 基礎知識(companion)問題のフィルタ優先順位と件数内訳表示 — 実装タスク

上から順に実装する。1タスク = 1コミットを目安にする。

## 実装

- [ ] 1. `lambda/src/app.js`: `selectionOrder`に`examType`（対象資格）引数を追加し、
      `scoreFn`がある分岐のtierループ内で target/companion の2段`domainBalancedOrder`呼び出しに変更
      （companion側が0件なら旧来の単発呼び出しに短絡）
- [ ] 2. `lambda/src/app.js`: `idsOnly`処理（L645付近）の`selectionOrder`呼び出しを新シグネチャに更新
- [ ] 3. dev Lambdaへデプロイし、ローカル/検証環境でサクッと演習・演習(Practice)の
      出題順序が意図通り（target優先→companion補充）になることを確認
- [ ] 4. `src/views/Home.tsx`: しっかり対策の抽出処理をtarget/companionプール分割の
      2段`weightedSampleWithoutReplacement`呼び出しに変更
- [ ] 5. `src/views/Home.tsx`: statusCounts取得useEffectに、目標資格単独（includeCompanion無し）の
      追加フェッチを足し、`companionUnanswered`/`companionIncorrect`/`companionBookmarked`を算出
- [ ] 6. `src/views/Home.tsx`: サクッと演習・しっかり対策の設定パネルの件数表示に
      「（基礎知識N問）」の内訳を追加（内訳が0または該当資格が無い場合は非表示）
- [ ] 7. `src/views/Practice.tsx`: 同様の内訳算出・表示をPractice.tsx側の演習・しっかり対策パネルにも追加

## テスト

- [ ] ユニットテストを追加（対象: `selectionOrder`のtarget/companion2段抽出、companion 0件時の短絡）
- [ ] 手動で受入条件を確認（spec.mdの受入条件チェックリスト全項目）

## デプロイ

- [ ] develop へ push
- [ ] `./scripts/deploy-lambda.sh dev`（`selectionOrder`変更のため必須）
- [ ] Cloudflare Pages のビルド完了を確認
- [ ] 検証環境で受入条件をすべて確認
- [ ] （ユーザーの明示指示後）`master` マージ + `./scripts/deploy-lambda.sh prod`

## クローズ

- [ ] `docs/06-exercise-logic.md` §6.2・§6.3・§6.4 に companion優先ルールを追記（**必須**）
- [ ] `spec.md` の状態を「完了（YYYY-MM-DD）」に更新
- [ ] 想定と違ったこと・学んだことを下に記録

## 実装後のメモ

<!--
やってみて分かったこと。次に同じ領域を触る人（＝将来の自分）への申し送り。
「plan と違う実装になった理由」は特に重要。
-->
