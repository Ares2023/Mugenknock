import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_ENDPOINT } from '../constants';

export default function ConfirmDelete() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'error'>('loading');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setErrorMsg('トークンが見つかりません'); return; }
    fetch(`${API_ENDPOINT}/confirm-delete?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) { setStatus('error'); setErrorMsg(data.error || 'エラーが発生しました'); return; }
        setEmail(data.email || '');
        setStatus(data.alreadyConfirmed ? 'already' : 'success');
      })
      .catch(() => { setStatus('error'); setErrorMsg('通信エラーが発生しました'); });
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-main, #f5f5f5)', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '40px 32px', maxWidth: 480, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <p style={{ color: '#666' }}>確認中...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>削除を承認しました</h2>
            {email && <p style={{ color: '#666', marginBottom: 16 }}>{email} のデータ削除が承認されました。</p>}
            <p style={{ color: '#888', fontSize: 14 }}>管理者がデータを削除できる状態になりました。このページは閉じて構いません。</p>
          </>
        )}
        {status === 'already' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>ℹ️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>承認済み</h2>
            <p style={{ color: '#666' }}>このリクエストはすでに承認されています。</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>エラー</h2>
            <p style={{ color: '#c00' }}>{errorMsg}</p>
            <p style={{ color: '#888', fontSize: 14, marginTop: 8 }}>リンクの有効期限（24時間）が切れているか、無効なリンクです。</p>
          </>
        )}
        <button
          onClick={() => navigate('/')}
          style={{ marginTop: 24, padding: '10px 24px', border: '1px solid #ccc', borderRadius: 9999, background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#666' }}
        >
          トップへ戻る
        </button>
      </div>
    </div>
  );
}
