import type { NextConfig } from 'next';
import path from 'path';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // workspace root 警告を抑制
  outputFileTracingRoot: path.join(__dirname),
  // 型エラーはビルドを止める（2026-09-10 に有効化）。
  // それまで無効だったのは typescript@4.9 が依存パッケージの .d.ts を構文解析できず
  // node_modules 由来のエラーが 258 件出ていたため。TS 5 へ上げて解消済み。
  // ESLint は設定がフラットコンフィグ未対応でまだ動かないため引き続きスキップ（docs/08-refactor-plan.md A-2）。
  eslint: { ignoreDuringBuilds: true },
};

export default config;
