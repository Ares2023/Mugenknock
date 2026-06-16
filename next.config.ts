import type { NextConfig } from 'next';
import path from 'path';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // workspace root 警告を抑制
  outputFileTracingRoot: path.join(__dirname),
  // 移行期間中の暫定措置：型エラー・ESLintエラーをビルド時にスキップ
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default config;
