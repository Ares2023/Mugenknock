import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { t } = useLanguage();
  const navigating = useRef(false);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--color-bg-main)',
      padding: 'var(--spacing-lg)'
    }}>
      <div style={{ marginBottom: 'var(--spacing-xl)', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--color-text-main)', margin: 0, fontSize: 'var(--font-size-xxl)', fontWeight: 700 }}>Sherpa</h1>
        <p style={{ color: 'var(--color-text-sub)', marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}>{t('login.tagline')}</p>
      </div>

      <Card style={{ width: '100%', maxWidth: 420, boxShadow: 'var(--box-shadow-md)' }} padding="var(--spacing-xl)">
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
      </Card>

      <div style={{ marginTop: 'var(--spacing-xl)' }}>
        <Button
          variant="ghost"
          onClick={() => navigate('/questions')}
          style={{ color: 'var(--color-primary)', fontWeight: 700 }}
        >
          {t('login.skipLogin')}
        </Button>
      </div>
    </div>
  );
}
