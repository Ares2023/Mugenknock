/**
 * スクリーンショット記録テスト
 * - 初回実行: ベースライン画像を生成（e2e/screenshots/baseline/）
 * - 2回目以降: 差分を検出
 *
 * 実行: npm run test:e2e:visual
 * ベースライン更新: npm run test:e2e:visual -- --update-snapshots
 */
import { test, expect } from '@playwright/test';
import { PageMonitor } from '../helpers/monitor';

const SNAPSHOT_PAGES = [
  { path: '/aws/',               name: 'home' },
  { path: '/aws/mypage',         name: 'mypage' },
  { path: '/aws/exercise/setup', name: 'exercise-setup' },
  { path: '/aws/practice',       name: 'practice' },
];

test.describe('スクリーンショット記録', () => {
  for (const { path, name } of SNAPSHOT_PAGES) {
    test(`${name} — ライトモード`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      if (page.url().includes('/login')) {
        test.skip(true, '認証が必要');
        return;
      }
      // スピナーが消えるまで待つ
      await page.waitForFunction(() => !document.querySelector('.sherpa-spinner'), { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500); // アニメーション待ち

      await expect(page).toHaveScreenshot(`${name}-light.png`, {
        fullPage: false,
        animations: 'disabled',
        threshold: 0.1, // 10%までの差異は許容
      });
    });

    test(`${name} — ダークモード`, async ({ page }) => {
      // ダークモードを強制
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(path, { waitUntil: 'networkidle' });
      if (page.url().includes('/login')) {
        test.skip(true, '認証が必要');
        return;
      }
      await page.waitForFunction(() => !document.querySelector('.sherpa-spinner'), { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot(`${name}-dark.png`, {
        fullPage: false,
        animations: 'disabled',
        threshold: 0.1,
      });
    });
  }
});
