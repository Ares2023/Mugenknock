import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('ログイン状態を保存', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_EMAIL;
  const password = process.env.PLAYWRIGHT_PASSWORD;

  if (!email || !password) {
    console.warn('⚠️  PLAYWRIGHT_EMAIL / PLAYWRIGHT_PASSWORD が未設定のため、ゲスト状態でセットアップします');
    // 認証なしの空ストレージを作成
    const dir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // ログイン後にホームかオンボーディングに遷移するまで待つ
  await page.waitForURL(/\/(aws\/)?(#.*)?$/, { timeout: 20_000 });

  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
  console.log('✅ 認証状態を保存しました:', AUTH_FILE);
});
