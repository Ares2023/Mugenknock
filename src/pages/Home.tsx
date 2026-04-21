import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 32 }}>
      <h2 style={{ color: '#232f3e', marginTop: 0 }}>ダッシュボード</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        <button
          onClick={() => navigate('/exercise/setup')}
          style={{ padding: '18px', fontSize: 17, background: '#ff9900', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{ fontWeight: 'bold' }}>演習モードを始める</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>試験種別・問題数を設定して演習</div>
        </button>
        <button
          onClick={() => navigate('/exam/setup')}
          style={{ padding: '18px', fontSize: 17, background: '#232f3e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{ fontWeight: 'bold' }}>模試モードを始める</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>本番同様の問題数・時間制限で模試</div>
        </button>
        <button
          onClick={() => navigate('/questions')}
          style={{ padding: '18px', fontSize: 17, background: '#eee', color: '#232f3e', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{ fontWeight: 'bold' }}>問題一覧を見る</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>全問題の閲覧・CSV出力・コピー</div>
        </button>
      </div>
    </div>
  );
}
