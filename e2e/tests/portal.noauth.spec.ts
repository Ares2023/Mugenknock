/**
 * 認証不要ページのスモークテスト
 * ログイン不要で実行できる最低限の健全性チェック
 */
import { test, expect } from '@playwright/test';
import { PageMonitor } from '../helpers/monitor';

test.describe('ポータル・ログイン画面', () => {
  test('ポータルページが表示され、コンソールエラーがない', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/無限ノック/);
    monitor.printReport('portal');
    expect(monitor.errors(), `Console errors: ${monitor.summary()}`).toHaveLength(0);
  });

  test('ログインページが表示される', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
    monitor.printReport('login');
    expect(monitor.errors(), `Console errors: ${monitor.summary()}`).toHaveLength(0);
  });

  test('存在しないパスは / にリダイレクト', async ({ page }) => {
    await page.goto('/nonexistent-path-xyz');
    await expect(page).toHaveURL(/\//);
  });
});
