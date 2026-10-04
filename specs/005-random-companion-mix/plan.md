# 公式資格と基礎知識資格の出題割合をランダムにする — 設計

## 参照した既存仕様

- `docs/06-exercise-logic.md` §6.1（`includeCompanion`）・§6.2（ドメイン均等化・`selectionOrder`）
- `specs/003-original-exam-blend`（混在の仕組み）、`specs/004-companion-filter-priority`（本specが置き換える優先順位）
- `CLAUDE.md`「出題ドメイン配分の方針（確定）」

## アプローチ

### 採用案: 2系列を「残り件数に比例した確率」でマージする

```
1. 公式(target)と基礎知識(companion)に分ける
2. 各側を、これまでどおり domainBalancedOrder で並べる（側の内部のドメイン均等化は維持）
3. 先頭から1問ずつ、側を確率で選んで取り出す:
     P(基礎知識) = 基礎知識の残り件数 / (公式の残り + 基礎知識の残り)
   選ばれた側の次の1問を出力に追加し、その側の残りを1減らす
4. どちらかが尽きたら、残りをそのまま追加する
```

**性質**（テストで確認する）:

- この方式は、「各側の相対順序を保ったまま、全ての混ぜ方を等確率で選ぶ」ことと等価
  （残り件数比の抽選は、一様なランダムマージの逐次的な表現）。
  つまり期待される基礎知識の割合は、問題数比と一致し、位置による偏りもない
- 各側の相対順序が保たれるので、側の内部のドメイン均等化はそのまま効く
- どちらが先に出るかも確率で決まる（先頭の1問も偏らない）

### 適用箇所

- フィルタなし（`scoreFn` が無い）: 全体を1回この方式で混ぜる
- フィルタあり: 各スコア階層の中で混ぜる。階層の順序（一致度の高い階層が先）は維持する
- 基礎知識が無い（混在なし）・公式が無い（階層に基礎知識しかない）場合は、
  非空の側を `domainBalancedOrder` に渡すだけ＝従来と同じ

### 却下した案

- **固定割合（例: 基礎30%）**: 設定値を決める必要があり、プールの大きさが違う資格
  （基礎27%〜40%）で不自然になる。ユーザーが問題数比を選んだ
- **セッションごとに割合自体を乱数で決める**: 日によって基礎知識が0%になる等、変動が大きい
- **バケット単位の重みづけ（deficit round-robin の重みを調整）**: 割合が間接的にしか制御できず、
  ドメイン数に依存する今の問題を引きずる
- **全問をシャッフルしてからドメイン均等化**: ドメイン均等化が割合を決める構造が残り、解決しない

## 変更するファイル

| ファイル | 変更 |
|---|---|
| `lambda/src/selection.js`（新規） | `shuffle` / `domainBucketKey` / `domainBalancedOrder` / `interleaveByPool` / `companionMixedOrder` / `selectionOrder` を移す（**依存ゼロ**＝単体テストできる） |
| `lambda/src/app.js` | 上記を `require('./selection')` に置き換え。`domainBalancedOrderWithCompanionPriority` を削除 |
| `lambda/test/selection.test.js`（新規） | 単体テスト（`node --test`） |
| `docs/06-exercise-logic.md` | §6.1 / §6.2 を更新（混在の割合・フィルタ時の挙動） |
| `docs/04-api.md` | `idsOnly` の並び順の説明を更新 |
| `specs/004-companion-filter-priority/spec.md` | 項目1が本specに置き換えられたことを追記 |
| `CLAUDE.md` | 「出題ドメイン配分の方針（確定）」に、各側の内部で維持する旨を追記 |

`src/utils/domainBalance.ts`（フォールバック経路）は触らない。到達しない経路で、docs/06 に既に注記がある。

## データモデルの変更

なし。

## API の変更

`GET /questions?idsOnly=true&includeCompanion=true` の `questionIds` の**並び順だけ**が変わる。
リクエスト・レスポンスの形は変わらない。

## 状態・永続化

なし。

## テスト方針

1. **単体テスト**（`lambda/test/selection.test.js`、`node --test`）
   - 全問が1回ずつ含まれる / 各側の相対順序が保たれる / 片側が空のとき従来と同じ
   - 統計: プール 314:166 で、先頭 5・10・20 問の基礎知識の割合の平均が 34.6% に一致（許容±1.5%）、
     試行ごとにばらつく（分散 > 0）、先頭の1問も偏らない
   - 階層: フィルタ階層の順序が維持され、階層の中で混ざる
   - 実測した「現状の固定挙動」（MLA 先頭10問が必ず60%）が再現しなくなっていること
2. **dev Lambda に出して、実 API で再計測**（今回の問題を測ったのと同じ手順）:
   MLA / AIF / DEA / SCS の先頭 5・10・20・30問の基礎知識の割合を30回ずつ
3. **フィルタ経路の実機確認**: 存在しない userId + `unansweredOnly=true` で階層の経路を通し、混ざることを確認

## デプロイ手順

1. `./scripts/deploy-lambda.sh dev` → 実 API で再計測
2. develop に push → ビルド成功まで確認
3. **prod の Lambda は、人間の確認を取ってから** `./scripts/deploy-lambda.sh prod`
   （CLAUDE.md「Lambda 更新ルール」。dev と prod を揃えるまで完了としない）

## リスクと巻き戻し方

- **出題順が変わる**ので、本番に出す前に、dev で割合を実測して確認する
- 巻き戻しは旧コードの再デプロイ（Lambda）と `Home.tsx` の revert。DB の変更なし
- 切り出しで `app.js` の他の参照（`shuffle` は `items = shuffle(items)`、`domainBucketKey` は
  `qDomain` の組み立て）が壊れないこと → import し直しの後、`node --check` と実 API で確認
- 「prod への反映忘れ」の前例（約1か月ランダム出題が続いた）があるので、
  prod 反映後に実機で割合を再計測する
