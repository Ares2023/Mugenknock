/**
 * マイページ E2E テスト
 */
import { test, expect } from '@playwright/test';
import { PageMonitor } from '../helpers/monitor';

test.describe('マイページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/aws/mypage', { waitUntil: 'networkidle' });
    if (page.url().includes('/login')) {
      test.skip(true, '認証が必要');
    }
  });

  test('マイページが表示され、コンソールエラーがない', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/aws/mypage', { waitUntil: 'networkidle' });

    await expect(page.locator('body')).not.toBeEmpty();
    monitor.printReport('マイページ');
    expect(monitor.errors()).toHaveLength(0);
  });

  test('3つのタブが表示される', async ({ page }) => {
    const targetTab = page.getByRole('button', { name: /目標/ });
    const analysisTab = page.getByRole('button', { name: /苦手分析|Analysis/ });
    const historyTab = page.getByRole('button', { name: /履歴|History/ });

    await expect(targetTab).toBeVisible({ timeout: 5_000 });
    await expect(analysisTab).toBeVisible();
    await expect(historyTab).toBeVisible();
  });

  test('苦手分析タブへの切り替えでエラーがない', async ({ page }) => {
    const monitor = new PageMonitor(page);
    const analysisTab = page.getByRole('button', { name: /苦手分析|Analysis/ });
    await analysisTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // API レスポンス待ち
    monitor.printReport('苦手分析タブ');
    expect(monitor.errors()).toHaveLength(0);
  });

  test('履歴タブへの切り替えでエラーがない', async ({ page }) => {
    const monitor = new PageMonitor(page);
    const historyTab = page.getByRole('button', { name: /履歴|History/ });
    await historyTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    monitor.printReport('履歴タブ');
    expect(monitor.errors()).toHaveLength(0);
  });
});
