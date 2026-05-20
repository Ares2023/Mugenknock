import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator, ThemeProvider, Theme } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/ui/Button';

const amplifyTheme: Theme = {
  name: 'sherpa-theme',
  tokens: {
    colors: {
      brand: {
        primary: {
          10:  { value: '#E8F3FF' },
          20:  { value: '#C5DFFF' },
          40:  { value: '#7DB8FF' },
          60:  { value: '#3A91FF' },
          80:  { value: '#006CE0' },
          90:  { value: '#0055B3' },
          100: { value: '#003D80' },
        },
      },
    },
    components: {
      authenticator: {
        router: {
          borderWidth: { value: '1px' },
          borderColor: { value: '#eaeded' },
          boxShadow: { value: '0 4px 12px rgba(0,0,0,0.08)' },
        },
      },
    },
  },
};

const CERT_BADGES = [
  { code: 'CLF-C02', label: 'Cloud Practitioner',       level: 'Foundational' },
  { code: 'SAA-C03', label: 'Solutions Architect',       level: 'Associate'    },
  { code: 'SAP-C02', label: 'Solutions Architect',       level: 'Professional' },
  { code: 'DOP-C02', label: 'DevOps Engineer',           level: 'Professional' },
  { code: 'AIF-C01', label: 'AI Practitioner',           level: 'Foundational' },
  { code: 'MLA-C01', label: 'Machine Learning Engineer', level: 'Associate'    },
  { code: 'GAI-C01', label: 'Generative AI Developer',   level: 'Professional' },
];

// 7 fixed positions (top%, left%) spread around the page, away from center
const POSITIONS: [number, number, number][] = [
  [6,   4,  -12],
  [6,  72,    8],
  [22,  2,   15],
  [22, 76,  -10],
  [72,  3,   -8],
  [72, 74,   12],
  [87, 38,   -5],
];

const LEVEL_COLOR: Record<string, string> = {
  Foundational: '#6b9e3a',
  Associate:    '#006CE0',
  Professional: '#8b5cf6',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { t } = useLanguage();
  const navigating = useRef(false);

  return (
    <ThemeProvider theme={amplifyTheme}>
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--color-bg-main)',
        padding: 'var(--spacing-lg)',
        overflow: 'hidden',
      }}>

        {/* 背景装飾：資格バッジ */}
        {CERT_BADGES.map((badge, i) => {
          const [top, left, rotate] = POSITIONS[i];
          return (
            <div
              key={badge.code}
              style={{
                position: 'absolute',
                top: `${top}%`,
                left: `${left}%`,
                transform: `rotate(${rotate}deg)`,
                opacity: 0.13,
                pointerEvents: 'none',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
              }}
            >
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: LEVEL_COLOR[badge.level],
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                {badge.level}
              </span>
              <span style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#16191f',
                whiteSpace: 'nowrap',
              }}>
                {badge.code}
              </span>
              <span style={{
                fontSize: 11,
                color: '#545b64',
                whiteSpace: 'nowrap',
              }}>
                AWS Certified {badge.label}
              </span>
            </div>
          );
        })}

        {/* ロゴ・タイトル */}
        <div style={{ marginBottom: 'var(--spacing-xl)', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <img
            src="/mugen-header.png"
            alt="AWS資格無限ノック"
            style={{ height: 44, width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }}
          />
          <p style={{
            color: 'var(--color-text-sub)',
            marginTop: 'var(--spacing-sm)',
            fontSize: 'var(--font-size-base)',
          }}>
            {t('login.tagline')}
          </p>
        </div>

        {/* Amplify Authenticator（Card不要・ThemeProviderで統一） */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420 }}>
          <Authenticator
            loginMechanisms={['email']}
            signUpAttributes={['email']}
          >
            {({ user: cognitoUser }) => {
              if (cognitoUser && !navigating.current) {
                navigating.current = true;
                refresh().then(() => navigate('/aws/', { replace: true }));
              }
              return <></>;
            }}
          </Authenticator>
        </div>

        <div style={{ marginTop: 'var(--spacing-xl)', position: 'relative', zIndex: 1 }}>
          <Button
            variant="outline"
            onClick={() => navigate('/questions')}
            style={{ color: 'var(--color-primary)', fontWeight: 700 }}
          >
            {t('login.skipLogin')}
          </Button>
        </div>
      </div>
    </ThemeProvider>
  );
}
