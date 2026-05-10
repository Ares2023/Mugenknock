import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { signOut as amplifySignOut } from 'aws-amplify/auth';
import { useAuth } from '../contexts/AuthContext';
import { ADMIN_EMAIL } from '../constants';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const navigating = useRef(false);
  const [accessDenied, setAccessDenied] = useState(false);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--color-secondary)', padding: 'var(--spacing-lg)', fontFamily: 'sans-serif',
    }}>
      <div style={{ marginBottom: 'var(--spacing-xl)', textAlign: 'center' }}>
        <div style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', marginBottom: 6 }}>
          ADMINISTRATOR ACCESS
        </div>
        <div style={{ color: 'var(--color-bg-white)', fontWeight: 700, fontSize: 'var(--font-size-xl)' }}>AWS資格無限ノック</div>
        <div style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', marginTop: 6 }}>管理者専用ページ</div>
      </div>

      {accessDenied && (
        <div style={{
          background: '#3d1a1a', border: '1px solid #be0000', borderRadius: 'var(--border-radius-md)',
          padding: '12px 20px', marginBottom: 'var(--spacing-lg)', color: '#ff6b6b',
          fontSize: 'var(--font-size-base)', maxWidth: 400, textAlign: 'center',
        }}>
          このアカウントに管理者権限はありません。
        </div>
      )}

      <Card style={{ width: '100%', maxWidth: 420, background: '#232f3e', borderColor: '#3a4a5a' }} padding="var(--spacing-xl)">
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
      </Card>

      <Button
        variant="outline"
        onClick={() => navigate('/')}
        style={{ marginTop: 'var(--spacing-xl)', color: 'var(--color-text-light)' }}
      >
        ← サイトへ戻る
      </Button>
    </div>
  );
}
