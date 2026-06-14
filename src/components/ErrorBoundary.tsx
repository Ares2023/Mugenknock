'use client';
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    reportError(error, { componentStack: info.componentStack ?? '' });
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{
          padding: '40px 24px',
          textAlign: 'center',
          color: 'var(--color-text-main)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>画面の表示中にエラーが発生しました</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-sub)', marginBottom: 20 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              borderRadius: 'var(--border-radius-full)',
              border: '1.5px solid var(--color-border)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 14,
              color: 'var(--color-text-main)',
            }}
          >
            ページを再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function reportError(error: Error, context: Record<string, string>) {
  try {
    const API = process.env.REACT_APP_API_ENDPOINT;
    if (!API) return;
    const body = {
      message: error.message,
      stack: error.stack ?? '',
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      ...context,
    };
    navigator.sendBeacon
      ? navigator.sendBeacon(`${API}/errors`, JSON.stringify(body))
      : fetch(`${API}/errors`, { method: 'POST', body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch {}
}
