import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { signOut as amplifySignOut } from 'aws-amplify/auth';
import { useAuth } from '../contexts/AuthContext';
import { ADMIN_EMAIL } from '../constants';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const navigating = useRef(false);
  const [accessDenied, setAccessDenied] = useState(false);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#1a2433', fontFamily: 'sans-serif',
    }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ color: '#e47911', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', marginBottom: 6 }}>
          ADMINISTRATOR ACCESS
        </div>
        <div style={{ color: '#d5dbdb', fontWeight: 700, fontSize: 20 }}>Sherpa</div>
        <div style={{ color: '#545b64', fontSize: 13, marginTop: 6 }}>管理者専用ページ</div>
      </div>

      {accessDenied && (
        <div style={{
          background: '#3d1a1a', border: '1px solid #be0000', borderRadius: 6,
          padding: '12px 20px', marginBottom: 20, color: '#ff6b6b',
          fontSize: 14, maxWidth: 400, textAlign: 'center',
        }}>
          このアカウントに管理者権限はありません。
        </div>
      )}

      <div style={{
        background: '#232f3e', padding: '32px', borderRadius: 6,
        border: '1px solid #3a4a5a', width: '100%', maxWidth: 400,
      }}>
        <Authenticator
          loginMechanisms={['email']}
          hideSignUp={true}
        >
          {({ user: cognitoUser }) => {
            if (cognitoUser && !navigating.current) {
              navigating.current = true;
              refresh().then(async () => {
                const email = cognitoUser.signInDetails?.loginId ?? '';
                if (email === ADMIN_EMAIL) {
                  navigate('/admin', { replace: true });
                } else {
                  await amplifySignOut();
                  navigating.current = false;
                  setAccessDenied(true);
                }
              });
            }
            return <></>;
          }}
        </Authenticator>
      </div>

      <button
        onClick={() => navigate('/')}
        style={{
          marginTop: 24, background: 'none', border: 'none',
          color: '#545b64', fontSize: 13, cursor: 'pointer', padding: '4px 8px',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#879596'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#545b64'; }}
      >
        ← サイトへ戻る
      </button>
    </div>
  );
}
