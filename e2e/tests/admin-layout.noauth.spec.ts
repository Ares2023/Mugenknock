// 管理画面（全16タブ）のレイアウト監査。PC/モバイルで横スクロール発生を機械検出し、
// 各タブのスクリーンショットを撮る。要 PLAYWRIGHT_EMAIL/PLAYWRIGHT_PASSWORD（管理者権限アカウント）。
//
// auth.setup.ts の storageState 経由だと Amplify トークンが保存されないケースがあったため、
// テスト内で直接ログインする（guest-vs-auth.noauth.spec.ts と同じ方式）。
import { test, expect } from '@playwright/test';

const TABS = [
  'questions', 'import', 'growth', 'scan', 'tips', 'columnideas', 'dailyservice', 'releases', 'passcomments',
  'announcements', 'reports', 'messages', 'deleteuser',
  'theme', 'admins', 'about',
] as const;

async function auditOverflow(page: import('@playwright/test').Page) {
  const vw = page.viewportSize()!.width;
  return page.evaluate((vw) => {
    const docW = document.documentElement.scrollWidth;
    const offenders: { tag: string; cls: string; right: number; width: number; text: string }[] = [];
    document.querySelectorAll<HTMLElement>('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (getComputedStyle(el).position === 'fixed') return;
      if (r.right > vw + 1) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 50),
          right: Math.round(r.right),
          width: Math.round(r.width),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
        });
      }
    });
    const top = offenders
      .sort((a, b) => b.right - a.right)
      .filter((o, i, arr) => arr.findIndex(x => x.right === o.right && x.width === o.width) === i)
      .slice(0, 4);
    return { overflow: docW - vw, top };
  }, vw);
}

for (const [label, viewport] of [
  ['PC', { width: 1280, height: 900 }],
  ['SP', { width: 390, height: 844 }],
] as const) {
  test.describe(`管理画面 ${label}`, () => {
    test.use({ viewport });

    test(`${label}: 全16タブの横はみ出し・スクリーンショット`, async ({ page }) => {
      test.setTimeout(300_000);
      const email = process.env.PLAYWRIGHT_EMAIL;
      const password = process.env.PLAYWRIGHT_PASSWORD;
      if (!email || !password) { console.log(`[${label}] 認証情報が無いためスキップ`); return; }

      await page.goto('/admin-login', { waitUntil: 'domcontentloaded' });
      await page.locator('input[type="email"]').waitFor({ timeout: 20_000 });
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).first().click();
      await page.waitForURL(/\/admin\/?$/, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(3000);

      const bodyText0 = await page.locator('body').innerText().catch(() => '');
      if (bodyText0.includes('このアカウントに管理者権限はありません')) {
        console.log(`[${label}] ★管理者権限なしと判定された（AppSettings.admins に反映されていない可能性）`);
        return;
      }
      if (!page.url().includes('/admin') || page.url().includes('/admin-login')) {
        console.log(`[${label}] ★管理画面に到達できていない。URL=${page.url()} body先頭="${bodyText0.slice(0, 100)}"`);
        return;
      }

      const bad: string[] = [];
      for (const tab of TABS) {
        await page.evaluate((t) => localStorage.setItem('adminActiveTab', t), tab);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const { overflow, top } = await auditOverflow(page);
        const mark = overflow > 1 ? '★はみ出し' : 'OK';
        console.log(`[${label}] ${tab.padEnd(14)} 差=${overflow > 0 ? '+' + overflow : overflow} ${mark}`);
        if (overflow > 1) {
          bad.push(`${tab} (+${overflow}px)`);
          top.forEach(o => console.log(`    └ <${o.tag} class="${o.cls}"> right=${o.right} w=${o.width} "${o.text}"`));
        }

        await page.screenshot({ path: `e2e/screenshots/admin-audit/${label}-${tab}.png`, fullPage: true });
      }

      console.log(`\n=== ${label} まとめ: はみ出し ${bad.length}/${TABS.length} タブ ===`);
      bad.forEach(b => console.log('  - ' + b));
      expect(bad, `横スクロールが発生したタブ:\n${bad.join('\n')}`).toEqual([]);
    });
  });
}
