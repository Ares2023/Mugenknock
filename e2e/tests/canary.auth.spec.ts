/**
 * 認証カナリアテスト — ログイン後の主要フローのスモーク
 *
 * 認証あり(chromium project, storageState 再利用)で実行する。
 * 目的: ログイン済みユーザーの主要導線（ホーム/マイページ/演習開始）が
 *       本番相当環境で「本当に動いているか」を短時間で確認する。
 *
 * 実行（認証カナリア専用ランナー canary-auth.sh から）:
 *   PLAYWRIGHT_BASE_URL=https://mugenknock.pages.dev \
 *   PLAYWRIGHT_EMAIL=... PLAYWRIGHT_PASSWORD=... \
 *   npx playwright test e2e/tests/canary.auth.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';
import { PageMonitor } from '../helpers/monitor';

const BROWSER_NOISE: RegExp[] = [
  /Failed to load resource.*404/,
  /Failed to load resource.*ERR_ABORTED/,
  /AdSense.*data-nscript/,
  /data-nscript/,
  /violates the following.*Content Security Policy/,
  /frame-ancestors/,
];

function assertNoRealErrors(monitor: PageMonitor, label: string) {
  const real = monitor.errors().filter(e => !BROWSER_NOISE.some(p => p.test(e.text)));
  const cors = real.filter(e => /CORS|Access-Control-Allow-Origin|blocked by CORS/.test(e.text));
  const js   = real.filter(e => !/CORS|Access-Control-Allow-Origin|blocked by CORS/.test(e.text));
  const net5xx = monitor.networkErrors.filter(e => e.status >= 500);
  if (cors.length)   console.error(`[${label}] CORS:\n`  + cors.map(e => `  ${e.text}`).join('\n'));
  if (js.length)     console.error(`[${label}] JS:\n`    + js.map(e => `  ${e.text}`).join('\n'));
  if (net5xx.length) console.error(`[${label}] 5xx:\n`   + net5xx.map(e => `  ${e.status} ${e.url}`).join('\n'));
  expect(cors,   `[${label}] CORS エラー`).toHaveLength(0);
  expect(js,     `[${label}] JS エラー`).toHaveLength(0);
  expect(net5xx, `[${label}] サーバーエラー(5xx)`).toHaveLength(0);
}

// ① 認証状態でホームが表示される（＝ログインが効いている）
test('認証ホーム /aws/ が表示される', async ({ page }) => {
  const monitor = new PageMonitor(page);
  await page.goto('/aws/', { waitUntil: 'networkidle' });
  // ログインへ飛ばされていないこと（認証が効いている）
  expect(page.url(), 'ログインページへリダイレクトされた（認証失敗の可能性）').not.toMatch(/\/login/);
  await expect(page.locator('header, main, h1, h2').first()).toBeVisible({ timeout: 12_000 });
  monitor.printReport('認証ホーム');
  assertNoRealErrors(monitor, '認証ホーム');
});

// ② マイページが表示され、タブが揃う（認証ユーザー向けUI）
test('マイページ /aws/mypage が表示されタブが揃う', async ({ page }) => {
  const monitor = new PageMonitor(page);
  await page.goto('/aws/mypage', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /目標/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /苦手分析|Analysis/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /履歴|History/ })).toBeVisible();
  monitor.printReport('マイページ');
  assertNoRealErrors(monitor, 'マイページ');
});

// ③ 演習を開始して問題・選択肢が表示される（最重要の認証導線）
test('演習設定→開始→問題・選択肢が表示される', async ({ page }) => {
  const monitor = new PageMonitor(page);
  await page.goto('/aws/exercise/setup', { waitUntil: 'networkidle' });

  // 問題数を最小に（あれば）
  const countInput = page.locator('input[type="range"], input[type="number"]').first();
  if (await countInput.count() > 0) {
    try { await countInput.fill('3'); } catch { /* range は fill 不可な場合あり */ }
  }
  const startBtn = page.getByRole('button', { name: /開始|start/i }).first();
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  await startBtn.click();

  // 確認ダイアログがあれば進む
  const confirmBtn = page.getByRole('button', { name: /開始する/ });
  if (await confirmBtn.count() > 0) {
    try { await confirmBtn.first().click({ timeout: 3_000 }); } catch { /* なければ無視 */ }
  }

  // 問題文 + 選択肢が表示される（1問目が実際にロードされる）
  await expect(page.locator('h1, h2, p').filter({ hasText: /問|\?|？|どれ|選/ }).first())
    .toBeVisible({ timeout: 15_000 });
  const choices = page.locator('button').filter({ hasNot: page.locator('svg') });
  await expect(choices.first()).toBeVisible({ timeout: 8_000 });

  monitor.printReport('演習開始');
  assertNoRealErrors(monitor, '演習開始');
});
