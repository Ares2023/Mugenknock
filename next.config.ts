import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // 移行期間中の暫定措置：型エラー・ESLintエラーをビルド時にスキップ
  // 移行完了後に削除する
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default config;
