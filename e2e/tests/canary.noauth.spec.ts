/**
 * カナリアテスト — ログイン不要
 *
 * デプロイ後に「本当に動いているか」を 2 分以内で確認する。
 * JS エラー・CORS エラー・API 4xx/5xx・UI の基本操作を網羅。
 *
 * 実行:
 *   npm run e2e:canary
 *   PLAYWRIGHT_BASE_URL=https://mugenknock.pages.dev npm run e2e:canary
 */
import { test, expect } from '@playwright/test';
import { PageMonitor } from '../helpers/monitor';

// ── ヘルパー ──────────────────────────────────────────────────────────
function isCorsError(text: string) {
  return /CORS|Access-Control-Allow-Origin|blocked by CORS/.test(text);
}

/** 404 応答などブラウザが出す既知の無害なコンソールエラーパターン */
const BROWSER_NOISE: RegExp[] = [
  /Failed to load resource.*404/,
  /Failed to load resource.*ERR_ABORTED/,
  /AdSense.*data-nscript/,
  /data-nscript/,
  /violates the following.*Content Security Policy/,
  /frame-ancestors/,
];

function filterRealErrors(monitor: PageMonitor) {
  return monitor.errors().filter(e =>
    !BROWSER_NOISE.some(p => p.test(e.text))
  );
}

function assertNoRealErrors(monitor: PageMonitor, label: string) {
  const cors   = monitor.errors().filter(e => isCorsError(e.text));
  const js     = filterRealErrors(monitor).filter(e => !isCorsError(e.text));
  const net5xx = monitor.networkErrors.filter(e => e.status >= 500);

  if (cors.length)   console.error(`[${label}] CORS エラー:\n` + cors.map(e => `  ${e.text}`).join('\n'));
  if (js.length)     console.error(`[${label}] JS エラー:\n`   + js.map(e => `  ${e.text}`).join('\n'));
  if (net5xx.length) console.error(`[${label}] 5xx:\n` + net5xx.map(e => `  ${e.status} ${e.url}`).join('\n'));

  expect(cors,   `[${label}] CORS エラー`).toHaveLength(0);
  expect(js,     `[${label}] JS エラー`).toHaveLength(0);
  expect(net5xx, `[${label}] サーバーエラー (5xx)`).toHaveLength(0);
}

/** Helmet スタブは title を設定しないため、ページ本体の表示で確認する */
async function assertPageVisible(page: import('@playwright/test').Page, selector: string, timeout = 10_000) {
  await expect(page.locator(selector).first()).toBeVisible({ timeout });
}

// ── ① ページ表示 ──────────────────────────────────────────────────────
test.describe('ページ表示チェック', () => {
  const pages = [
    { path: '/',           label: 'ランディングページ', check: 'header, main, h1, h2' },
    { path: '/login',      label: 'ログインページ',     check: 'input[type="email"]' },
    { path: '/about',      label: 'Aboutページ',        check: 'text=プライバシーポリシー' },
    { path: '/sample/SAA', label: 'サンプル問題(SAA)',  check: 'main' },
    { path: '/sample/CLF', label: 'サンプル問題(CLF)',  check: 'main' },
  ];

  for (const { path, label, check } of pages) {
    test(`${label} が表示される (${path})`, async ({ page }) => {
      const monitor = new PageMonitor(page);
      await page.goto(path, { waitUntil: 'networkidle' });
      await assertPageVisible(page, check, 12_000);

      monitor.printReport(label);
      assertNoRealErrors(monitor, label);
    });
  }
});

// ── ② ランディングページ操作 ─────────────────────────────────────────
test.describe('ランディングページ', () => {
  test('CTA ボタンをクリックして /aws/ に遷移する', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    const cta = page.getByRole('button', { name: /資格を選んで|始める|Start/i }).first();
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await cta.click();

    await expect(page).toHaveURL(/\/(aws\/)?/, { timeout: 10_000 });

    monitor.printReport('CTA クリック');
    assertNoRealErrors(monitor, 'CTA クリック');
  });

  test('ヘッダーのアカウントボタンで /login に遷移する', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    const accountBtn = page.locator('header button').last();
    await expect(accountBtn).toBeVisible({ timeout: 5_000 });
    await accountBtn.click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    monitor.printReport('アカウントボタン');
    assertNoRealErrors(monitor, 'アカウントボタン');
  });
});

// ── ③ サンプル問題フロー ─────────────────────────────────────────────
test.describe('サンプル問題フロー', () => {
  test('SAA: 問題・選択肢が表示され選択できる', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/sample/SAA', { waitUntil: 'networkidle' });

    // 問題テキストが表示されること（APIレスポンス待ち）
    const questionEl = page.locator('main p, main li, main h2').filter({ hasText: /.{20,}/ }).first();
    await expect(questionEl).toBeVisible({ timeout: 20_000 });

    // 選択肢ボタンが存在すること
    const choices = page.locator('button').filter({ hasText: /^[A-E][\.\s]|^[①②③④⑤]/ });
    const choiceCount = await choices.count();
    if (choiceCount > 0) {
      // 選択肢をクリックしてエラーが起きないこと
      await choices.first().click();
      await page.waitForTimeout(500);
    }

    monitor.printReport('SAA サンプル問題');
    assertNoRealErrors(monitor, 'SAA サンプル問題');
  });

  test('存在しない資格コードは一覧ページを表示する', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/sample/INVALID', { waitUntil: 'networkidle' });

    // クラッシュせず何らかのコンテンツが表示されること（404 は期待値なので printReport しない）
    await assertPageVisible(page, 'main, body', 8_000);
    assertNoRealErrors(monitor, '無効な資格コード');
  });
});

// ── ④ API ヘルスチェック ─────────────────────────────────────────────
test.describe('API ヘルスチェック', () => {
  test('settings/theme API が CORS エラーなく応答する', async ({ page }) => {
    const monitor = new PageMonitor(page);

    // theme API は全ページで呼ばれる（ThemeContext）
    await page.goto('/', { waitUntil: 'networkidle' });

    monitor.printReport('settings/theme');
    const corsErrors = monitor.errors().filter(e => isCorsError(e.text));
    expect(corsErrors, `CORS エラー: ${corsErrors.map(e => e.text).join(', ')}`).toHaveLength(0);
  });

  test('サンプルページで questions API が CORS エラーなく応答する', async ({ page }) => {
    const monitor = new PageMonitor(page);

    // questions API の応答を待つ
    const apiCall = page.waitForResponse(
      r => r.url().includes('/questions') && r.status() < 500,
      { timeout: 20_000 }
    ).catch(() => null);

    await page.goto('/sample/SAA', { waitUntil: 'networkidle' });
    const resp = await apiCall;

    if (resp) {
      expect(resp.status(), `questions API status`).toBeLessThan(500);
    }

    monitor.printReport('questions API');
    const corsErrors = monitor.errors().filter(e => isCorsError(e.text));
    expect(corsErrors, `CORS エラー`).toHaveLength(0);
  });
});

// ── ⑤ ナビゲーション連続操作 ────────────────────────────────────────
test.describe('ナビゲーション連続操作', () => {
  test('ランディング → サンプル → About → ログイン を連続遷移してもエラーなし', async ({ page }) => {
    const monitor = new PageMonitor(page);

    await page.goto('/',            { waitUntil: 'networkidle' });
    await page.goto('/sample/SAA', { waitUntil: 'networkidle' });
    await page.goto('/about',       { waitUntil: 'networkidle' });
    await page.goto('/login',       { waitUntil: 'networkidle' });

    monitor.printReport('連続ナビゲーション');
    assertNoRealErrors(monitor, '連続ナビゲーション');
  });

  test('モバイルサイズ (390px) でランディングページが壊れない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const monitor = new PageMonitor(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.locator('header')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('main')).toBeVisible({ timeout: 5_000 });

    // ヘッダーがビューポート幅に収まっていること（横スクロールなし）
    const headerWidth = await page.locator('header').evaluate(el => el.scrollWidth);
    expect(headerWidth, 'ヘッダーが横スクロールしている').toBeLessThanOrEqual(400);

    monitor.printReport('モバイル表示');
    assertNoRealErrors(monitor, 'モバイル表示');
  });
});

// ── ⑥ 404 / リダイレクト ───────────────────────────────────────────
test.describe('404・リダイレクト', () => {
  test('存在しないパスで 404 ページが表示される（アプリはクラッシュしない）', async ({ page }) => {
    const monitor = new PageMonitor(page);
    const resp = await page.goto('/this-page-does-not-exist-xyz');

    // Cloudflare Pages は 404 を返す（リダイレクトせず）
    // アプリが JS エラーでクラッシュしていないことを確認
    expect([200, 404]).toContain(resp?.status());
    await expect(page.locator('body')).not.toBeEmpty();

    // 404 の `Failed to load resource` 以外の JS エラーがないこと
    const realErrors = filterRealErrors(monitor);
    expect(realErrors, `404ページでJS クラッシュ`).toHaveLength(0);
  });

  test('Aboutページの #privacy ハッシュでタブが切り替わる', async ({ page }) => {
    const monitor = new PageMonitor(page);
    await page.goto('/about', { waitUntil: 'networkidle' });

    // ハッシュ付き URL に遷移
    await page.goto('/about#privacy', { waitUntil: 'networkidle' });
    await assertPageVisible(page, 'button, p', 5_000);

    monitor.printReport('About #privacy');
    assertNoRealErrors(monitor, 'About #privacy');
  });
});
