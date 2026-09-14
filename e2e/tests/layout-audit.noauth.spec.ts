// 全画面のレイアウト監査（デスクトップ / モバイル）。
// 横スクロール（はみ出し）を機械的に検出し、原因要素を特定する。
// スクリーンショットは e2e/screenshots/audit/ に出力して目視確認に使う。
//
// 実行:
//   PLAYWRIGHT_BASE_URL=https://mugenknock.pages.dev \
//     npx playwright test e2e/tests/layout-audit.noauth.spec.ts --project=no-auth
import { test, expect } from '@playwright/test';

const PAGES: { path: string; name: string }[] = [
  { path: '/',                    name: 'portal' },
  { path: '/aws/',                name: 'home' },
  { path: '/aws/practice',        name: 'practice' },
  { path: '/aws/exam/setup',      name: 'exam-setup' },
  { path: '/aws/encyclopedia',    name: 'encyclopedia' },
  { path: '/aws/cheatsheet',      name: 'cheatsheet' },
  { path: '/aws/exam-dashboard',  name: 'exam-dashboard' },
  { path: '/aws/announcements',   name: 'announcements' },
  { path: '/aws/release-notes',   name: 'release-notes' },
  { path: '/aws/others',          name: 'others' },
  { path: '/aws/mypage',          name: 'mypage' },
  { path: '/aws/stats',           name: 'stats' },
  { path: '/account',             name: 'account' },
  { path: '/about',               name: 'about' },
  { path: '/architecture',        name: 'architecture' },
  { path: '/login',               name: 'login' },
  { path: '/encyclopedia',        name: 'seo-encyclopedia' },
  { path: '/services',            name: 'seo-services' },
  { path: '/exam-guide',          name: 'seo-exam-guide' },
  { path: '/exam-guide/SAA',      name: 'seo-exam-guide-saa' },
  { path: '/questions/SAA',       name: 'seo-questions' },
  { path: '/privacy-policy',      name: 'seo-privacy' },
];

// ゲストでも中身が出るよう初期フラグを立てる
const SEED = () => {
  localStorage.setItem('targetExam_guest', 'SAA');
  localStorage.setItem('cookie_consent_v1', 'accepted');
  localStorage.setItem('guestBannerHidden', '1');
  localStorage.setItem('mk_onboarding_tutorial_done_v1', '1');
};

type Overflow = { tag: string; cls: string; id: string; right: number; width: number; text: string };

async function audit(page: import('@playwright/test').Page, label: string, name: string) {
  const vw = page.viewportSize()!.width;

  const result = await page.evaluate((vw) => {
    const docW = document.documentElement.scrollWidth;
    const offenders: Overflow[] = [];
    document.querySelectorAll<HTMLElement>('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // position:fixed の装飾（バナー等）は横スクロールを作らないので除外
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed') return;
      if (r.right > vw + 1) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 40),
          id: el.id || '',
          right: Math.round(r.right),
          width: Math.round(r.width),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45),
        });
      }
    });
    // 最も外側だけ残す（親がはみ出せば子も出るため、重複を減らす）
    const top = offenders
      .sort((a, b) => b.right - a.right)
      .filter((o, i, arr) => arr.findIndex(x => x.right === o.right && x.width === o.width) === i)
      .slice(0, 4);
    // 本文カラムの幅（PageLayout の max-width 準拠を見る）
    const main = document.querySelector('main') as HTMLElement | null;
    return { docW, top, mainW: main ? Math.round(main.getBoundingClientRect().width) : null };
  }, vw) as { docW: number; top: Overflow[]; mainW: number | null };

  const overflow = result.docW - vw;
  const mark = overflow > 1 ? '★はみ出し' : 'OK';
  console.log(`[${label}] ${name.padEnd(22)} vw=${vw} scrollW=${result.docW} 差=${overflow > 0 ? '+' + overflow : overflow} ${mark}${result.mainW ? ` main=${result.mainW}px` : ''}`);
  if (overflow > 1) {
    result.top.forEach(o =>
      console.log(`    └ <${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? ' class="' + o.cls + '"' : ''}> right=${o.right} w=${o.width} "${o.text}"`)
    );
  }
  return overflow;
}

for (const [label, viewport] of [
  ['PC', { width: 1280, height: 900 }],
  ['SP', { width: 390, height: 844 }],  // iPhone 14 相当
] as const) {
  test.describe(`${label} レイアウト監査`, () => {
    test.use({ viewport });

    test(`${label}: 全画面の横はみ出しを検査`, async ({ page }) => {
      test.setTimeout(300_000);
      const bad: string[] = [];
      await page.goto('/aws/');
      await page.evaluate(SEED);

      for (const p of PAGES) {
        try {
          await page.goto(p.path, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2500);
          const over = await audit(page, label, p.name);
          if (over > 1) bad.push(`${p.name} (+${over}px)`);
          await page.screenshot({
            path: `e2e/screenshots/audit/${label}-${p.name}.png`,
            fullPage: true,
          });
        } catch (e) {
          console.log(`[${label}] ${p.name.padEnd(22)} 読み込み失敗: ${(e as Error).message.slice(0, 80)}`);
        }
      }

      console.log(`\n=== ${label} まとめ: はみ出し ${bad.length} 件 ===`);
      bad.forEach(b => console.log('  - ' + b));
      expect(bad, `横スクロールが発生した画面:\n${bad.join('\n')}`).toEqual([]);
    });
  });
}
