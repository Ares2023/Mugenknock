import type { Page } from '@playwright/test';

export type ConsoleEntry = {
  type: 'error' | 'warning' | 'info';
  text: string;
  url: string;
};

export type NetworkEntry = {
  status: number;
  method: string;
  url: string;
};

/**
 * ページのコンソールエラー・ネットワークエラーを収集するモニター
 *
 * 使い方:
 *   const monitor = new PageMonitor(page);
 *   await page.goto('/aws/');
 *   monitor.assertNoErrors();  // エラーがあれば test.fail()
 *   monitor.printReport();     // ログ出力
 */
export class PageMonitor {
  readonly consoleEntries: ConsoleEntry[] = [];
  readonly networkErrors: NetworkEntry[] = [];

  // コンソールエラーとして無視するパターン（既知の外部ライブラリの警告など）
  private readonly ignorePatterns: RegExp[] = [
    /ResizeObserver loop limit exceeded/,
    /ResizeObserver loop completed with undelivered notifications/,
    /Non-Error promise rejection captured/,
    /Warning: ReactDOM.render is deprecated/,
    /Support for defaultProps will be removed/,
    // 第三者の解析/広告リソース。ビーコンのRUM送信がheadless環境でCORS/読込失敗しても
    // アプリの不具合ではないため無視（テキストに当該ドメインが含まれる）。
    /cloudflareinsights/,   // Cloudflare Web Analytics（/cdn-cgi/rum への RUM POST 等）
    /googlesyndication/,    // Google AdSense
    /doubleclick/,          // 広告配信
    /pagead/,               // AdSense
  ];

  // 無視するネットワーク URL パターン（第三者の解析/広告リソースは読込失敗しても無害）
  private readonly ignoreNetworkPatterns: RegExp[] = [
    /google-analytics/,
    /analytics/,
    /favicon\.ico/,
    /cloudflareinsights/,   // Cloudflare Web Analytics ビーコン（headless環境で ERR_FAILED になりうる）
    /googlesyndication/,    // Google AdSense
    /doubleclick/,          // 広告配信
    /pagead/,               // AdSense
  ];

  constructor(private readonly page: Page) {
    page.on('console', msg => {
      const type = msg.type();
      if (type !== 'error' && type !== 'warning') return;
      const text = msg.text();
      if (this.ignorePatterns.some(p => p.test(text))) return;
      // 「Failed to load resource: net::ERR_*」等は失敗リソースのURLで判定し、
      // 既知の第三者(解析/広告)ドメインの読込失敗は無視する。
      const resUrl = msg.location()?.url ?? '';
      if (resUrl && this.ignoreNetworkPatterns.some(p => p.test(resUrl))) return;
      this.consoleEntries.push({
        type: type as 'error' | 'warning',
        text,
        url: resUrl || page.url(),
      });
    });

    page.on('pageerror', err => {
      this.consoleEntries.push({
        type: 'error',
        text: `[UNCAUGHT] ${err.message}`,
        url: page.url(),
      });
    });

    page.on('response', resp => {
      const status = resp.status();
      if (status < 400) return;
      const url = resp.url();
      if (this.ignoreNetworkPatterns.some(p => p.test(url))) return;
      this.networkErrors.push({
        status,
        method: resp.request().method(),
        url,
      });
    });
  }

  errors() {
    return this.consoleEntries.filter(e => e.type === 'error');
  }

  warnings() {
    return this.consoleEntries.filter(e => e.type === 'warning');
  }

  hasErrors(): boolean {
    return this.errors().length > 0;
  }

  hasNetworkErrors(): boolean {
    // 401/403 は認証エラーなので別扱いにすることも可
    return this.networkErrors.filter(e => e.status >= 500).length > 0;
  }

  printReport(label = '') {
    const prefix = label ? `[${label}] ` : '';
    if (this.errors().length > 0) {
      console.log(`\n${prefix}❌ Console Errors (${this.errors().length}):`);
      this.errors().forEach(e => console.log(`  ${e.url}\n  → ${e.text}`));
    }
    if (this.warnings().length > 0) {
      console.log(`\n${prefix}⚠️  Warnings (${this.warnings().length}):`);
      this.warnings().forEach(w => console.log(`  ${w.url}\n  → ${w.text}`));
    }
    if (this.networkErrors.length > 0) {
      console.log(`\n${prefix}🌐 Network Errors (${this.networkErrors.length}):`);
      this.networkErrors.forEach(n => console.log(`  ${n.status} ${n.method} ${n.url}`));
    }
  }

  summary(): string {
    const parts: string[] = [];
    if (this.errors().length > 0) parts.push(`${this.errors().length} console error(s)`);
    if (this.warnings().length > 0) parts.push(`${this.warnings().length} warning(s)`);
    if (this.networkErrors.length > 0) parts.push(`${this.networkErrors.length} network error(s)`);
    return parts.length > 0 ? parts.join(', ') : 'clean';
  }
}
