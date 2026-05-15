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

## 技術スタック
- React + TypeScript (Create React App)
- AWS Amplify Gen1
- AWS CLI: `/home/yuzuki/local/bin/aws`（グローバルにインストールされていない）

## アイコンの取得先
- Lucide（https://lucide.dev/icons/）からSVGパスを取得してコンポーネント化する
- 定義場所：`src/components/Icons.tsx`

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
