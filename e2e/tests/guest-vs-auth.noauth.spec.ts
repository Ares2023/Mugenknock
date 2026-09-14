// ゲストとログインユーザーで画面の骨格（セクションの有無・位置・高さ）がどれだけ違うかを実測する。
// 目的は「デザインを揃える」作業の前後比較。差分は縦位置(y)と高さ(h)で出す。
import { test } from '@playwright/test';

const BASE_SEED = () => {
  localStorage.setItem('cookie_consent_v1', 'accepted');
  localStorage.setItem('mk_onboarding_tutorial_done_v1', '1');
};

// 画面内の「見出しテキスト」を手がかりに、主要セクションの位置と高さを拾う
async function skeleton(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const marks = ['目標演習量', '予想スコア', 'ドメイン別正答率', '日めくりAWSサービス'];
    const out: { label: string; y: number; h: number }[] = [];
    for (const m of marks) {
      const el = Array.from(document.querySelectorAll<HTMLElement>('div,span,h1,h2,h3'))
        .find(e => (e.textContent || '').trim().startsWith(m) && e.children.length <= 2);
      if (!el) { out.push({ label: m, y: -1, h: -1 }); continue; }
      // 見出しを含むカード（角丸の箱）まで遡る
      let card: HTMLElement = el;
      for (let i = 0; i < 6 && card.parentElement; i++) {
        const cs = getComputedStyle(card);
        if (cs.borderRadius !== '0px' && card.getBoundingClientRect().height > 40) break;
        card = card.parentElement;
      }
      const r = card.getBoundingClientRect();
      out.push({ label: m, y: Math.round(r.top + window.scrollY), h: Math.round(r.height) });
    }
    return { sections: out, docH: Math.round(document.body.scrollHeight) };
  });
}

for (const [label, viewport] of [
  ['PC', { width: 1280, height: 900 }],
  ['SP', { width: 390, height: 844 }],
] as const) {
  test.describe(`${label}`, () => {
    test.use({ viewport });

    test(`${label}: ゲストとログインの骨格差分`, async ({ browser }) => {
      test.setTimeout(240_000);
      const email = process.env.PLAYWRIGHT_EMAIL;
      const password = process.env.PLAYWRIGHT_PASSWORD;

      // --- ゲスト ---
      const guestCtx = await browser.newContext({ viewport });
      const guest = await guestCtx.newPage();
      await guest.goto('/aws/');
      await guest.evaluate(() => { localStorage.setItem('targetExam_guest', 'SAA'); });
      await guest.evaluate(BASE_SEED);
      await guest.reload();
      await guest.waitForTimeout(5000);
      const g = await skeleton(guest);
      await guest.screenshot({ path: `e2e/screenshots/audit/${label}-home-guest.png`, fullPage: true });

      if (!email || !password) {
        console.log(`[${label}] 認証情報が無いためゲストのみ計測`);
        g.sections.forEach(s => console.log(`    ゲスト ${s.label.padEnd(16)} y=${s.y} h=${s.h}`));
        await guestCtx.close();
        return;
      }

      // --- ログイン ---
      const authCtx = await browser.newContext({ viewport });
      const auth = await authCtx.newPage();
      await auth.goto('/login');
      await auth.locator('input[type="email"]').waitFor({ timeout: 20_000 });
      await auth.locator('input[type="email"]').fill(email);
      await auth.locator('input[type="password"]').fill(password);
      // Amplify UI のサインインボタンは type="submit" ではないためテキストで指定する
      await auth.getByRole('button', { name: 'サインイン' }).first().click();
      await auth.waitForURL(/\/aws\/?$/, { timeout: 40_000 }).catch(() => {});
      await auth.waitForTimeout(4000);
      await auth.evaluate(BASE_SEED);

      // ゲスト側と条件を揃える。目標資格が未設定だとオンボーディングが開いてしまい
      // 下の本体が比較できないため、idToken の sub を取り出して同じ SAA を設定する。
      const sub = await auth.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('CognitoIdentityServiceProvider.') && k.endsWith('.idToken')) {
            const t = localStorage.getItem(k);
            if (!t) continue;
            try {
              const p = JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
              return p.sub as string;
            } catch { /* 次の候補へ */ }
          }
        }
        return null;
      });
      if (!sub) { console.log(`[${label}] ★ログインしていない（idToken が無い）ため比較できない`); await guestCtx.close(); await authCtx.close(); return; }
      await auth.evaluate((s) => { localStorage.setItem(`targetExam_${s}`, 'SAA'); }, sub);

      await auth.goto('/aws/');
      await auth.waitForTimeout(6000);

      // ログイン状態が本当に反映されているか（ゲスト専用バナーが出ていないこと）で確認
      const bannerVisible = await auth.getByText('そのまま演習できます').count();
      console.log(`[${label}] ログイン確認: sub=${sub.slice(0, 8)}… / ゲストバナー表示=${bannerVisible ? '★あり(未ログインの疑い)' : 'なし(OK)'}`);
      const a = await skeleton(auth);
      await auth.screenshot({ path: `e2e/screenshots/audit/${label}-home-auth.png`, fullPage: true });

      console.log(`[${label}] セクション位置・高さの比較（ゲスト → ログイン）`);
      for (let i = 0; i < g.sections.length; i++) {
        const gs = g.sections[i], as = a.sections[i];
        const dy = gs.y >= 0 && as.y >= 0 ? as.y - gs.y : null;
        const dh = gs.h >= 0 && as.h >= 0 ? as.h - gs.h : null;
        const mark = (dy !== null && Math.abs(dy) > 2) || (dh !== null && Math.abs(dh) > 2) ? ' ★差あり' : '';
        console.log(`    ${gs.label.padEnd(18)} y ${String(gs.y).padStart(5)}→${String(as.y).padStart(5)} (${dy ?? '-'})   h ${String(gs.h).padStart(4)}→${String(as.h).padStart(4)} (${dh ?? '-'})${mark}`);
      }
      console.log(`    ページ全体の高さ    ${g.docH} → ${a.docH} (${a.docH - g.docH})`);

      await guestCtx.close();
      await authCtx.close();
    });
  });
}
