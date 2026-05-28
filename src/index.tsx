import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Amplify } from 'aws-amplify';
import outputs from './amplify_outputs.json';

Amplify.configure(outputs);

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
