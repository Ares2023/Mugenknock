import { defineConfig, devices } from '@playwright/test';

// テスト対象URL: PLAYWRIGHT_BASE_URL 環境変数 > デフォルトはローカル開発サーバー
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 認証状態の競合を防ぐため直列実行

  reporter: [
    ['html', { outputFolder: 'e2e/reports', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },

  projects: [
    // ① 認証セットアップ（他のテストより先に実行）
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ② デスクトップ Chrome（認証あり）
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // ③ スマホ（iPhone 14 Pro）
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // ④ 認証不要ページのみ（ログイン不要で実行できるスモークテスト）
    {
      name: 'no-auth',
      testMatch: /.*\.noauth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
