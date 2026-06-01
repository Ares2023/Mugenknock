import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Amplify } from 'aws-amplify';
import outputs from './amplify_outputs.json';

Amplify.configure(outputs);

// グローバルエラーハンドラ（未捕捉の JS エラー / Promise rejection を CloudWatch に送信）
const API_BASE = process.env.REACT_APP_API_ENDPOINT;
function sendErrorBeacon(payload: object) {
  if (!API_BASE) return;
  const data = JSON.stringify({ ...payload, url: window.location.href, ua: navigator.userAgent, ts: new Date().toISOString() });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(`${API_BASE}/errors`, data);
    else fetch(`${API_BASE}/errors`, { method: 'POST', body: data, keepalive: true }).catch(() => {});
  } catch {}
}
window.addEventListener('error', e => {
  sendErrorBeacon({ type: 'uncaught', message: e.message, stack: e.error?.stack ?? '' });
});
window.addEventListener('unhandledrejection', e => {
  const reason = e.reason;
  sendErrorBeacon({ type: 'unhandledrejection', message: reason?.message ?? String(reason), stack: reason?.stack ?? '' });
});

// AdSense: 管理者画面では広告スクリプトを削除
if (window.location.pathname.startsWith('/admin')) {
  const SCRIPT_SELECTOR = 'script[src*="adsbygoogle.js"]';
  const script = document.querySelector(SCRIPT_SELECTOR);
  if (script) {
    script.remove();
  }
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
