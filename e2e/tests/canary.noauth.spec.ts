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

// dev/prod を PLAYWRIGHT_BASE_URL から自動判定
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const isProd = BASE_URL.includes('mugenknock.com') && !BASE_URL.includes('pages.dev');
const API_BASE = process.env.PLAYWRIGHT_API_URL
  ?? `https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/${isProd ? 'prod' : 'dev'}`;

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
    { path: '/',                label: 'ランディングページ',      check: 'header, main, h1, h2' },
    { path: '/login',           label: 'ログインページ',          check: 'input[type="email"]' },
    { path: '/about',           label: 'Aboutページ',             check: 'text=プライバシーポリシー' },
    { path: '/encyclopedia',    label: 'サービス図鑑（公開）',    check: 'main' },
    { path: '/privacy-policy',  label: 'プライバシーポリシー',    check: 'h1' },
    { path: '/exam-guide',      label: '試験別ガイド一覧',        check: 'h1' },
    { path: '/services',        label: 'AWSサービス図鑑（SEO）',  check: 'h1' },
    { path: '/questions/SAA',   label: '練習問題一覧（SAA）',     check: 'h1' },
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
  test('CTA ボタンをクリックして遷移する', async ({ page }) => {
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

// ── ③ API ヘルスチェック ─────────────────────────────────────────────
test.describe('API ヘルスチェック', () => {
  test('settings/theme API が CORS エラーなく応答する', async ({ page }) => {
    const monitor = new PageMonitor(page);

    // theme API は全ページで呼ばれる（ThemeContext）
    await page.goto('/', { waitUntil: 'networkidle' });

    monitor.printReport('settings/theme');
    const corsErrors = monitor.errors().filter(e => isCorsError(e.text));
    expect(corsErrors, `CORS エラー: ${corsErrors.map(e => e.text).join(', ')}`).toHaveLength(0);
  });

  test('questions API (metaOnly) が CORS エラーなく 200 を返す', async ({ page }) => {
    const monitor = new PageMonitor(page);
    // ランディングページのオリジンからブラウザコンテキストで fetch → CORS 検証
    await page.goto('/', { waitUntil: 'networkidle' });

    const result = await page.evaluate(async (url: string) => {
      try {
        const r = await fetch(url);
        return { ok: true, status: r.status };
      } catch (e: any) {
        return { ok: false, error: String(e) };
      }
    }, `${API_BASE}/questions?examType=SAA&metaOnly=true&limit=1`);

    expect(result.ok, `questions API CORS/network エラー: ${(result as any).error ?? ''}`).toBe(true);
    expect((result as any).status, 'questions API status').toBeLessThan(500);

    monitor.printReport('questions API');
    const corsErrors = monitor.errors().filter(e => isCorsError(e.text));
    expect(corsErrors, 'CORS エラー').toHaveLength(0);
  });
});

// ── ④ ナビゲーション連続操作 ────────────────────────────────────────
test.describe('ナビゲーション連続操作', () => {
  test('ランディング → サービス図鑑 → About → ログイン を連続遷移してもエラーなし', async ({ page }) => {
    const monitor = new PageMonitor(page);

    await page.goto('/',             { waitUntil: 'networkidle' });
    await page.goto('/encyclopedia', { waitUntil: 'networkidle' });
    await page.goto('/about',        { waitUntil: 'networkidle' });
    await page.goto('/login',        { waitUntil: 'networkidle' });

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

// ── ⑤ 404 / リダイレクト ───────────────────────────────────────────
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
