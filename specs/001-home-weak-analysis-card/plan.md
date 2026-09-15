# ホーム画面「苦手分析」カード — 設計

`spec.md` の受入条件を満たすための実装方針。

## 参照した既存仕様

- `docs/05-screens.md` §5.2 Home — 起動時データ取得の順序（`domainStats` は
  `GET /users/me/stats` から SWR で取得済み）、§5.7 MyPage — 苦手分析タブが
  ログイン必須である前提
- `CLAUDE.md` ゲスト/ログインの機能境界 — 苦手分析・Focusedモードはログイン専用と明記

## アプローチ

### 採用案

MyPage.tsx の苦手分析タブに既にある実装（`focusedUnlocked` 判定・
`GET /users/me/weak-questions`・`domainStats` からの苦手ドメイン算出）を、
Home.tsx 側でも同じ考え方で再実装する。コンポーネント共有はしない
（MyPage側はモーダル展開や複数ウィンドウ切替など要件が異なり、Homeは
「要約して見せてクリックでマイページへ渡す」だけなので、無理に共通化すると
互いの変更が波及しやすくなる。行数も少ないため複製の方が安全）。

Home.tsx は既に `answeredCount` / `focusedUnlocked` / `domainStats` を
state として持っている（Focusedモードの解放判定に使用中）ので、これを流用する。
新規に取得するのは `weak-questions` のみで、**`focusedUnlocked` になるまでは
fetch しない**（MyPageと同じ遅延ロード方針）。

### 却下した案

| 案 | 却下理由 |
|---|---|
| MyPageの苦手分析タブを共通コンポーネント化してHome/MyPage両方から呼ぶ | 表示要件（要約 vs 全件、モーダル有無）が違いすぎて共通化のメリットが薄く、変更の影響範囲がかえって広がる |
| ゲストにも簡易版（今セッションの誤答数など）を出す | `CLAUDE.md` のゲスト/ログイン境界に反する。ゲストのローカル累積を増やす方向になりやすい |

## 変更するファイル

| ファイル | 変更内容 |
|---|---|
| `src/views/Home.tsx` | 右カラム（日めくりAWSサービスの下、`!isMobile` 限定）に「苦手分析」カードを追加。`weakQuestions` state と取得 `useEffect`（`focusedUnlocked` になったら `GET /users/me/weak-questions?minIncorrect=2` を1回だけ）を追加。苦手ドメインは既存 `domainStats` から算出（`domains` の正答率でソートし上位のみ抽出、MyPageの並び替えロジックを踏襲） |

## データモデルの変更

なし。

**既存データの移行が必要か**: いいえ

## API の変更

なし。既存の `GET /users/me/weak-questions?userId=&examType=&minIncorrect=2` と
`GET /users/me/stats?userId=`（Home側で取得済みの `domainStats` を再利用）のみ使用。

**後方互換**: 該当なし（フロントのみの変更、新規APIコールも既存エンドポイントの再利用）

## 状態・永続化

localStorage/sessionStorage の追加なし。`weakQuestions` はコンポーネントローカルの
React state（MyPage.tsx と同じ扱い。ページ離脱で破棄されるキャッシュのみで
「累積データ」ではない）。

## テスト方針

- [ ] ユニットテストなし（既存Home.tsxにユニットテストが無い方針に合わせる）
- [ ] 手動確認の手順:
  1. デスクトップでゲストとしてホームを開き、カードが表示されないことを確認
  2. デスクトップでログイン済み・30問未満のアカウントで「あとX問でアンロック」表示を確認
  3. デスクトップでログイン済み・30問以上のアカウントで頻出ミス問題・苦手ドメインが
     表示され、クリックでマイページ苦手分析タブに遷移することを確認
  4. モバイルで見た目に変化が無いことを確認（既存のスクリーンショット比較）

## デプロイ手順

- [ ] `git push github develop`
- [ ] `./prompts/night-prompts/scripts/cf-deploy-status.sh wait`
- [ ] 検証環境で受入条件を確認
- [ ] （ユーザーの明示指示後）`master` マージ

> Lambda変更なし。

## リスクと巻き戻し方

| リスク | 影響 | 巻き戻し方 |
|---|---|---|
| `weak-questions` APIをHomeでも呼ぶことで初期ロードが増える | `focusedUnlocked` の間だけの遅延ロードなので影響は限定的（30問未満のユーザーは呼ばない） | Home.tsx の追加ブロックを削除するだけで元に戻る（API・DBの変更が無いため巻き戻しが容易） |
