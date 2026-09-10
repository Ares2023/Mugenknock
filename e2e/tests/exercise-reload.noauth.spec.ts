// 演習中のリロードで React のフック順序が壊れないことを保証する回帰テスト。
//
// 背景（docs/08-refactor-plan.md Bug-1）:
//   ExerciseSession.tsx は `if (!initialized) return null;` の後ろに useEffect/useRef が
//   5つ並んでおり、レンダーごとに呼ばれるフック数が変わっていた。
//   compat 層(src/compat/react-router-dom.tsx)は navigate 時に location.state を
//   sessionStorage へ書くが、初回描画ではモジュールキャッシュから読むため消えない。
//   そのため「1回目のリロードでは state が復活し、2回目で state が消える」。
//   2回目で initialized=false → 早期リターン → ドラフト復元で true → フックが増え、
//   React が "Rendered more hooks than during the previous render." を投げて
//   演習画面が Application error で落ちていた。
//
// このテストは「2回リロードしても演習が継続できる」ことを確認する。
//
// 注: ゲストで演習を開始するため、対象環境に guest のセッション行が1件作られる。
//     夜間カナリア(canary.noauth.spec.ts)には含めず、手動実行のみを想定している。
import { test, expect } from '@playwright/test';

test('演習中に2回リロードしてもフック順序が壊れず継続できる', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  // ゲストで開始できるよう、バナー・チュートリアルのフラグを立てておく
  await page.goto('/aws/');
  await page.evaluate(() => {
    localStorage.setItem('targetExam_guest', 'SAA');
    localStorage.setItem('cookie_consent_v1', 'accepted');
    localStorage.setItem('guestBannerHidden', '1');
    localStorage.setItem('mk_onboarding_tutorial_done_v1', '1');
  });
  await page.reload();

  await page.getByRole('button', { name: /サクッと演習を開始/ }).click();
  await page.waitForURL(/\/aws\/exercise\/session/, { timeout: 60_000 });
  await expect(page.getByText(/問題\s*1/)).toBeVisible({ timeout: 30_000 });

  // 1回目: compat 層が sessionStorage から state を復元する（同時に消費もする）
  await page.reload();
  await expect(page.getByText(/問題\s*1/)).toBeVisible({ timeout: 30_000 });

  // 2回目: state が無い状態でドラフトから復元される ← 以前はここで落ちていた
  await page.reload();
  await expect(page.getByText(/問題\s*1/)).toBeVisible({ timeout: 30_000 });

  const hookErrors = pageErrors.filter(e => /Rendered (more|fewer) hooks/.test(e));
  expect(hookErrors, `フック順序エラーが発生した:\n${hookErrors.join('\n')}`).toHaveLength(0);
  expect(pageErrors, `未処理の例外が発生した:\n${pageErrors.join('\n')}`).toHaveLength(0);

  // Next.js のクライアントエラー画面になっていないことも確認する
  await expect(page.getByText('Application error')).toHaveCount(0);
});
