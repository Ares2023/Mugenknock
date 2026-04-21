import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f5f5', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{ color: '#232f3e', margin: 0 }}>AWS資格問題サービス</h1>
        <p style={{ color: '#666', marginTop: 8 }}>ログインして演習を始めましょう</p>
      </div>

      <Authenticator
        loginMechanisms={['email']}
        signUpAttributes={['email']}
      >
        {({ user: cognitoUser }) => {
          if (cognitoUser) {
            refresh().then(() => navigate('/', { replace: true }));
          }
          return <></>;
        }}
      </Authenticator>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => navigate('/questions')}
          style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}
        >
          ログインせず問題一覧を見る
        </button>
      </div>
    </div>
  );
}
