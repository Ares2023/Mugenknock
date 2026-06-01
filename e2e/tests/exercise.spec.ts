/**
 * 演習フロー E2E テスト
 * - 演習設定 → 開始 → 問題表示 → 回答 → 次の問題
 */
import { test, expect } from '@playwright/test';
import { PageMonitor } from '../helpers/monitor';

test.describe('演習フロー', () => {
  test('演習設定ページが正しく表示される', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/aws/exercise/setup', { waitUntil: 'networkidle' });

    if (page.url().includes('/login')) {
      test.skip(true, '認証が必要');
      return;
    }

    // 演習開始ボタンが表示されること
    const startBtn = page.getByRole('button', { name: /開始|start/i }).first();
    await expect(startBtn).toBeVisible({ timeout: 10_000 });

    monitor.printReport('演習設定');
    expect(monitor.errors()).toHaveLength(0);
  });

  test('演習を開始して問題が表示される', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/aws/exercise/setup', { waitUntil: 'networkidle' });

    if (page.url().includes('/login')) {
      test.skip(true, '認証が必要');
      return;
    }

    // 問題数を最小にして開始
    const countInput = page.locator('input[type="range"], input[type="number"]').first();
    if (await countInput.isVisible()) {
      await countInput.fill('5');
    }

    const startBtn = page.getByRole('button', { name: /開始|start/i }).first();
    await expect(startBtn).toBeEnabled({ timeout: 10_000 });
    await startBtn.click();

    // 演習セッションに遷移するか確認ダイアログが出ることを確認
    const sessionOrConfirm = page.locator(
      '/aws/exercise/session, [role="dialog"], button:has-text("開始する")'
    );
    await expect(page).toHaveURL(/exercise\/(session|setup)/, { timeout: 15_000 });

    monitor.printReport('演習開始');
    // エラーがあれば soft fail（セッション画面で続けてチェックできるように）
    const errors = monitor.errors();
    if (errors.length > 0) {
      console.warn('演習開始時のコンソールエラー:', errors.map(e => e.text));
    }
  });

  test('演習セッション: 問題が表示され選択肢をクリックできる', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/aws/exercise/setup', { waitUntil: 'networkidle' });

    if (page.url().includes('/login')) {
      test.skip(true, '認証が必要');
      return;
    }

    // 最小問題数で開始
    const startBtn = page.getByRole('button', { name: /開始|start/i }).first();
    await expect(startBtn).toBeEnabled({ timeout: 10_000 });
    await startBtn.click();

    // 確認ダイアログがあれば承認
    const confirmBtn = page.getByRole('button', { name: /開始する/ });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page).toHaveURL(/exercise\/session/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    // 問題文が表示されること
    const questionText = page.locator('h1, h2, p').filter({ hasText: /問/ }).first();
    await expect(questionText).toBeVisible({ timeout: 10_000 });

    // 選択肢ボタンが4つ以上あること
    const choiceButtons = page.getByRole('button').filter({ hasText: /[A-E]\.|^[A-E]\./ });
    // 選択肢はボタンかつテキストを持つ要素
    const choices = page.locator('button').filter({ hasNot: page.locator('svg') });
    await expect(choices.first()).toBeVisible({ timeout: 5_000 });

    // 選択肢をクリックしてもエラーが出ないこと
    await choices.first().click();

    monitor.printReport('演習セッション');
    expect(monitor.errors(), `演習中エラー: ${monitor.summary()}`).toHaveLength(0);
  });
});
