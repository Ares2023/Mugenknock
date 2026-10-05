'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import OhineriDialog from '../components/OhineriDialog';
import { fetchLimits, confirmCheckout, type Limits } from './dailyLimit';

/**
 * 演習開始の直前に呼ぶ。上限が掛からなければ requested をそのまま返す。
 * 残りが足りないときは案内を出し、「残りの問題数で始める」なら切り詰めた数、閉じたら null を返す。
 * 取得に失敗したときは止めない（requested を返す）。ゲスト（user なし）は常に素通し。
 * handleReturn: Stripe から戻ったとき（?ohineri=success&session_id=…）に支払いの確認を依頼する。
 */
export function useOhineriGate(user: unknown, ja: boolean, handleReturn = false) {
  const [dlg, setDlg] = useState<{ limits: Limits; requested: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const resolver = useRef<((n: number | null) => void) | null>(null);

  const gate = useCallback(async (requested: number): Promise<number | null> => {
    if (!user) return requested;
    const limits = await fetchLimits();
    if (!limits || !limits.applies) return requested;
    if ((limits.remaining ?? 0) >= requested) return requested;
    return new Promise<number | null>(resolve => { resolver.current = resolve; setDlg({ limits, requested }); });
  }, [user]);

  const finish = (n: number | null) => { setDlg(null); resolver.current?.(n); resolver.current = null; };

  useEffect(() => {
    if (!handleReturn || !user || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const state = q.get('ohineri');
    if (!state) return;
    const sid = q.get('session_id');
    window.history.replaceState({}, '', window.location.pathname);
    if (state === 'success' && sid) {
      confirmCheckout(sid).then(l => setNotice(l?.unlimited
        ? (ja ? 'おひねりありがとうございます！1日の上限がなくなりました。' : 'Thank you! The daily limit has been removed.')
        : (ja ? '支払いの確認ができませんでした。反映されない場合は問い合わせてください。' : 'Could not confirm the payment. Please contact us if the limit is not removed.')));
    }
  }, [handleReturn, user, ja]);

  const ui = (
    <>
      {dlg && <OhineriDialog ja={ja} limits={dlg.limits} requested={dlg.requested}
        onStartCapped={n => finish(n)} onClose={() => finish(null)} />}
      {notice && (
        <div role="status" onClick={() => setNotice(null)}
          style={{ position: 'fixed', left: '50%', bottom: 'var(--spacing-lg)', transform: 'translateX(-50%)', zIndex: 300, background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--box-shadow-pop)', padding: 'var(--spacing-md)', fontSize: 'var(--font-size-sm2)', color: 'var(--color-text-main)', maxWidth: 'calc(100vw - 32px)', cursor: 'pointer' }}>
          {notice}
        </div>
      )}
    </>
  );
  return { gate, ui };
}
