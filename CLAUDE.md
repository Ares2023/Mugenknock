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
