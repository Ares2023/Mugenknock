# 問題インポート用 JSON（2026-10-16 作成）

管理画面「問題追加」から取り込むための問題データ。**5資格 × 100問 = 500問**。
作成しただけで、**まだ取り込んでいない**（DynamoDB には未反映）。

## 対象資格

現状の問題数が少ない順に5資格（`prompts/night-prompts/scripts/state/question_counts.json`、2026-09-25 時点のキャッシュ）。

| ファイル | 資格 | 取込前の問題数 | 追加 |
|---|---|---|---|
| `DB.json`  | DB（データベース 基礎知識）   | 149 | 100 |
| `AIB.json` | AIB（AI Business Strategist） | 153 | 100 |
| `SEC.json` | SEC（セキュリティ 基礎知識）  | 154 | 100 |
| `ML.json`  | ML（機械学習 基礎知識）       | 161 | 100 |
| `NW.json`  | NW（ネットワーク 基礎知識）   | 163 | 100 |

※ 取込前の問題数は上記キャッシュの値。DB に直接はつないでいないため、実際の件数とずれている可能性がある。

各資格 100問は、公式配点（`src/data/examDomains.json` の weight）に比例してドメインに配分している。

## 取り込み手順

1. 管理画面 →「問題追加」タブを開く。
2. 資格のボタンで **ファイルと同じ資格** を選ぶ（例: `DB.json` なら DB）。
3. ファイルを選ぶ（または JSON を貼り付ける）→「解析」→「インポート」。
4. 資格ごとに繰り返す（5回）。

形式は管理画面のプロンプトの出力形式と同じ。`examType` / `domain`（日本語名）/ `questionText` / `choices` /
`correctAnswerIndices` / `explanation` / `choiceExplanations` / `isMultiple`。

## ⚠️ 取り込み後の注意

- **取り込んだだけではアプリに出ない。** 問題の公開条件は `!isHidden && validityCheckedAt` で
  （`lambda/src/app.js`）、取込時は `validityCheckedAt` が付かない。
  `02-check-validity.sh`（妥当性チェック）が通ると付与される。
  **02 は 2026-06-29 から夜間リストでコメントアウト中**なので、再開するか手動で実行する必要がある。
- 取込先は共通テーブル。`/dev` と `/prod` のどちらの API で取り込んでも本番データに入る。
- 既存問題との重複チェックはしていない（DB に接続できなかったため）。取込後に `question-dedup.py` で確認するとよい。
- 事実関係の検証（`02-check-validity.sh`）は未実施。AWS 関連（AIB）は特に、取込後の検証を推奨。

## 品質ルール

`prompts/night-prompts/scripts/instructions/` の各資格の指示と `_common-rules.txt` に沿って作成した。
`validate.py` で次を機械的に検査している（5資格とも ERR 0）。

- 4択1正解 / 5択2正解、選択肢の重複なし、ラベル接頭辞なし
- `explanation` 120字以内、`choiceExplanations` 各80字以内、選択肢数と一致
- 「選択肢A/B」のレター参照なし、`explanation` が「正解」始まりでない
- ドメイン配分が配点どおり
- 正解位置は均等（0〜3番目がほぼ25%ずつ）
- 正解が唯一の最長選択肢になる割合を抑制（31%前後。目安は20〜25%）

## ファイル構成

- `DB.json` `AIB.json` `SEC.json` `ML.json` `NW.json` — **取り込み用（成果物）**
- `src/<資格>/*.json` — 作問用ソース（正解を先頭に書いた簡易形式）
- `build.py` — ソース → 取り込み用 JSON（正解位置を均等にシャッフル）
- `validate.py` — 形式・品質ルールの検査
- `fixlen.py` — 選択肢の長さ調整用の補助

再生成: `python3 build.py && python3 validate.py`
