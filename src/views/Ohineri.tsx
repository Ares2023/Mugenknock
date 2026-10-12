'use client';
import React, { useEffect, useState } from 'react';
import { useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageLayout from '../components/ui/PageLayout';
import { fetchLimits, confirmCheckout, createCheckoutUrl, type Limits } from '../utils/dailyLimit';

// おひねり（1日の演習上限を100円で撤廃）の案内と購入。specs/006。ログイン専用。
export default function Ohineri() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { lang } = useLanguage();
  const ja = lang === 'ja';

  const [limits, setLimits] = useState<Limits | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let alive = true;
    (async () => {
      // 決済ページから戻ったとき: URL の session_id は「確認の対象」を示すだけで、支払い済みかはサーバが Stripe に問い合わせて決める
      const q = new URLSearchParams(window.location.search);
      const state = q.get('ohineri');
      const sid = q.get('session_id');
      if (state) window.history.replaceState({}, '', window.location.pathname);
      let l: Limits | null = null;
      if (state === 'success' && sid) {
        l = await confirmCheckout(sid);
        if (alive) setMessage(l?.unlimited
          ? (ja ? 'おひねりありがとうございます！1日の上限がなくなりました。' : 'Thank you! The daily limit has been removed.')
          : (ja ? '支払いの確認ができませんでした。反映されない場合は、お問い合わせからご連絡ください。' : 'Could not confirm the payment. Please contact us if the limit is not removed.'));
      } else if (state === 'cancel') {
        if (alive) setMessage(ja ? '支払いはキャンセルされました。' : 'The payment was canceled.');
      }
      if (!l) l = await fetchLimits();
      if (alive) { setLimits(l); setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [user, authLoading, ja]);

  const pay = async () => {
    setBusy(true); setMessage(null);
    const url = await createCheckoutUrl();
    if (url) { window.location.href = url; return; }
    setBusy(false);
    setMessage(ja ? '決済ページを開けませんでした。時間をおいてお試しください。' : 'Could not open the payment page. Please try again later.');
  };

  const body = (() => {
    if (authLoading || (user && !loaded)) return null;
    if (!user) {
      return (
        <>
          <p style={textStyle}>{ja ? 'おひねりはログインしている方のみご利用いただけます。' : 'Tips are available to signed-in users only.'}</p>
          <Button variant="primary" onClick={() => navigate('/login')}>{ja ? 'ログインする' : 'Sign in'}</Button>
        </>
      );
    }
    if (!limits || !limits.purchaseEnabled) {
      return <p style={textStyle}>{ja ? '現在は準備中です。' : 'Not available yet.'}</p>;
    }
    return (
      <>
        <p style={textStyle}>
          {ja
            ? `無限ノックは、無料でほぼ不自由なくお使いいただけます。通常の演習は1日${limits.limit}問まで（日本時間の0時にリセット）で、模擬試験は対象外です。`
            : `Mugenknock is free to use. Regular practice is limited to ${limits.limit} questions per day (resets at midnight JST). Mock exams are not limited.`}
        </p>
        <p style={textStyle}>
          {ja
            ? `${limits.priceYen}円のおひねり（1回のみ）で、この1日の上限がなくなります。応援のしるしとしての任意のお支払いで、問題や機能が増えるなどの特典はありません。`
            : `A one-time ¥${limits.priceYen} tip removes this daily limit. It is an optional way to support the site; there are no other perks.`}
        </p>
        <p style={{ ...textStyle, fontWeight: 700, color: 'var(--color-text-main)' }}>
          {limits.unlimited
            ? (ja ? 'おひねりありがとうございます。1日の上限はありません。' : 'Thank you! You have no daily limit.')
            : (ja ? `今日の残り: ${limits.remaining ?? 0}問 / ${limits.limit}問` : `Remaining today: ${limits.remaining ?? 0} / ${limits.limit}`)}
        </p>
        {!limits.unlimited && (
          <>
            <Button variant="primary" disabled={busy} onClick={pay}>
              {busy ? (ja ? '移動中...' : 'Redirecting...') : (ja ? `${limits.priceYen}円でおひねりする` : `Tip ¥${limits.priceYen}`)}
            </Button>
            <p style={{ ...textStyle, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', margin: 0 }}>
              {ja ? '決済は Stripe のページで行います。カード情報は当サイトでは扱いません。' : 'Payment is handled on Stripe. We never see your card details.'}
            </p>
          </>
        )}
      </>
    );
  })();

  return (
    <PageLayout>
      <Card>
        <h2 style={{ margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>
          {ja ? 'おひねり' : 'Tip jar'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'flex-start' }}>
          {message && (
            <div role="status" style={{ width: '100%', boxSizing: 'border-box', padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-primary-light)', color: 'var(--color-text-main)', fontSize: 'var(--font-size-sm2)' }}>
              {message}
            </div>
          )}
          {body}
        </div>
      </Card>
    </PageLayout>
  );
}

const textStyle: React.CSSProperties = { margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', lineHeight: 1.8 };
