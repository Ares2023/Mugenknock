# ホーム画面「苦手分析」カード — 実装タスク

上から順に実装する。1タスク = 1コミットを目安にする。

## 実装

- [x] 1. `weakQuestions` state と、`focusedUnlocked` になったら1回だけ
      `GET /users/me/weak-questions?minIncorrect=2` を呼ぶ `useEffect` を Home.tsx に追加
- [x] 2. 既存 `domainStats` から苦手ドメイン上位1〜2件を算出するヘルパーを追加
      （MyPage.tsx の正答率ソートロジックを踏襲）
- [x] 3. 右カラム（日めくりAWSサービスカードの下）に「苦手分析」カードを追加。
      `{user && (...)}` でゲストには非表示。`focusedUnlocked` 未達時は
      アンロック案内のみ。カードクリックで `/aws/mypage`（苦手分析タブ）へ遷移
- [x] 4. モバイル（`isMobile`）分岐に影響が出ていないか確認

## テスト

- [x] 手動で受入条件（spec.md）を4パターンすべて確認
      （ゲスト / ログイン30問未満 / ログイン30問以上 / モバイル無変化）

## デプロイ

- [ ] develop へ push
- [ ] Cloudflare Pages のビルド完了を確認
- [ ] 検証環境で受入条件をすべて確認

## クローズ

- [x] `docs/05-screens.md` §5.2 Home のセクション構成表に追記
- [x] `spec.md` の状態を「完了（YYYY-MM-DD）」に更新
- [x] 想定と違ったこと・学んだことを下に記録

## 実装後のメモ

- MyPage.tsx の `tab` state に `location.state?.tab` を読む初期化を追加した
  （plan.md には書いていなかった小さな変更）。ホームからマイページの特定タブへ
  直接遷移する導線が今回で初めてできたため必要になった。
- カード自体の受入確認中に、既存の「初回チュートリアル」オーバーレイ
  （`ExamSelectOverlay onboarding`）が `localStorage.targetExam_<uid>` の
  有無だけで判定されており、サーバー側に目標資格があってもブラウザの
  localStorage が空だと毎回出る挙動に気づいた。今回のスコープ外の
  既存動作のため未修正（別途必要なら新規 spec で扱う）。
