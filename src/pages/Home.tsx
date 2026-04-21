import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Breadcrumb from '../components/Breadcrumb';

export default function Home() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <Breadcrumb items={[{ label: 'ホーム' }]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ color: '#232f3e', margin: 0 }}>AWS資格問題サービス</h1>
        <button
          onClick={handleSignOut}
          style={{ background: 'none', border: '1px solid #aaa', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', color: '#555', fontSize: 13 }}
        >
          ログアウト
        </button>
      </div>

      {user && (
        <p style={{ color: '#888', fontSize: 13, marginBottom: 32 }}>{user.username}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <button
          onClick={() => navigate('/exercise/setup')}
          style={{ padding: '16px', fontSize: 18, background: '#ff9900', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          演習モードを始める
        </button>
        <button
          onClick={() => navigate('/questions')}
          style={{ padding: '16px', fontSize: 18, background: '#232f3e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          問題一覧を見る
        </button>
        <button
          onClick={() => navigate('/admin')}
          style={{ padding: '12px', fontSize: 14, background: 'none', color: '#888', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}
        >
          管理画面
        </button>
      </div>
    </div>
  );
}
