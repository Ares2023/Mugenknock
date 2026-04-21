import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const navigating = useRef(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f2f3f3', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{ color: '#16191f', margin: 0, fontSize: 24, fontWeight: 700 }}>AWS Quiz Practice</h1>
        <p style={{ color: '#545b64', marginTop: 8, fontSize: 14 }}>ログインして演習を始めましょう</p>
      </div>

      <div style={{ background: 'white', padding: '32px', borderRadius: 2, border: '1px solid #eaeded', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)', width: '100%', maxWidth: 400 }}>
        <Authenticator
          loginMechanisms={['email']}
          signUpAttributes={['email']}
        >
          {({ user: cognitoUser }) => {
            if (cognitoUser && !navigating.current) {
              navigating.current = true;
              refresh().then(() => navigate('/', { replace: true }));
            }
            return <></>;
          }}
        </Authenticator>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => navigate('/questions')}
          style={{
            background: 'none', border: 'none', color: '#0073bb', cursor: 'pointer',
            fontSize: 14, fontWeight: 700, padding: '4px 8px'
          }}
          onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
          onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
        >
          ログインせず問題一覧を見る
        </button>
      </div>
    </div>
  );
}
