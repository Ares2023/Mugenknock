'use client';

import React, { Suspense, useEffect } from 'react';
import { Open_Sans } from 'next/font/google';
import { usePathname } from 'next/navigation';
import { Amplify } from 'aws-amplify';
import outputs from '../src/amplify_outputs.json';
import { AuthProvider } from '../src/contexts/AuthContext';
import { LanguageProvider } from '../src/contexts/LanguageContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import '../src/index.css';

Amplify.configure(outputs);

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin') ?? false;

  // AdSense は <head> 内の <script> タグ（静的 HTML）として出力するため useEffect 不要

  // エラービーコン（グローバルエラーハンドラ）
  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_ENDPOINT;
    if (!API_BASE) return;
    const sendErrorBeacon = (payload: object) => {
      const data = JSON.stringify({ ...payload, url: window.location.href, ua: navigator.userAgent, ts: new Date().toISOString() });
      try {
        if (navigator.sendBeacon) navigator.sendBeacon(`${API_BASE}/errors`, data);
        else fetch(`${API_BASE}/errors`, { method: 'POST', body: data, keepalive: true }).catch(() => {});
      } catch {}
    };
    const onError = (e: ErrorEvent) => sendErrorBeacon({ type: 'uncaught', message: e.message, stack: e.error?.stack ?? '' });
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      sendErrorBeacon({ type: 'unhandledrejection', message: r?.message ?? String(r), stack: r?.stack ?? '' });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);

  return (
    <html lang="ja" className={openSans.className}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#232f3e" />
        <link rel="icon" type="image/png" href="/mugen-icon.png" />
        <link rel="apple-touch-icon" href="/mugen-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        {/* AdSense 所有権確認・広告配信（/admin では isAdmin により body 側で除外） */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7579739275405898" crossOrigin="anonymous" />
        {/* テーマちらつき防止スクリプト */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');})();` }} />
        {/* JSON-LD */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          'name': '無限ノック',
          'url': 'https://mugenknock.com/',
          'description': 'AWS認定試験（SAA・CLF・SAPなど）の無料練習問題サービス。演習・模試・サービス図鑑の3本柱でスコアアップをサポート。',
          'applicationCategory': 'EducationApplication',
          'operatingSystem': 'All',
          'inLanguage': 'ja',
          'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'JPY' },
        }) }} />
        <style dangerouslySetInnerHTML={{ __html: `
          #initial-loader{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f2f3f3;gap:28px;z-index:9999;}
          html[data-theme="dark"] #initial-loader{background:#0d1117;}
          #initial-loader img{width:auto;height:56px;object-fit:contain;}
          @keyframes _spin{to{transform:rotate(360deg);}}
          #initial-loader-ring{width:40px;height:40px;border:3px solid #eaeded;border-top-color:#0047A3;border-radius:50%;animation:_spin 0.8s linear infinite;}
          html[data-theme="dark"] #initial-loader-ring{border-color:#30363d;border-top-color:#42B4FF;}
        ` }} />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <LanguageProvider>
              <Suspense fallback={null}>
                {children}
              </Suspense>
            </LanguageProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
