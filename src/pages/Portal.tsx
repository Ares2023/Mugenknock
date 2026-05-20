import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export default function Portal() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const ja = lang === 'ja';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg-main)',
      color: 'var(--color-text-main)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: 'inherit',
    }}>
      {/* ロゴ */}
      <div style={{ marginBottom: 12, textAlign: 'center' }}>
        <img
          src="/mugen-header.png"
          alt="MugenKnock"
          style={{ height: 44, width: 'auto', objectFit: 'contain' }}
        />
      </div>

      {/* タイトル */}
      <h1 style={{
        fontSize: 32,
        fontWeight: 800,
        margin: '0 0 8px',
        color: 'var(--color-text-main)',
        letterSpacing: '-0.5px',
      }}>
        MugenKnock
      </h1>
      <p style={{
        fontSize: 16,
        color: 'var(--color-text-sub)',
        margin: '0 0 48px',
        textAlign: 'center',
      }}>
        {ja ? '資格試験学習プラットフォーム' : 'Certification Study Platform'}
      </p>

      {/* カードグリッド */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        justifyContent: 'center',
        width: '100%',
        maxWidth: 800,
      }}>
        {/* AWS 認定資格カード */}
        <button
          onClick={() => navigate('/aws/')}
          style={{
            width: 260,
            padding: '32px 24px',
            background: 'var(--color-bg-white)',
            border: '2px solid var(--color-border)',
            borderRadius: 16,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--color-primary)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,108,224,0.15)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* AWS ロゴ風アイコン */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #FF9900 0%, #FF6600 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 28,
            fontWeight: 900,
            color: 'white',
            letterSpacing: '-1px',
          }}>
            AWS
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-text-main)',
            marginBottom: 8,
          }}>
            {ja ? 'AWS 認定資格' : 'AWS Certifications'}
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--color-text-sub)',
            lineHeight: 1.5,
          }}>
            {ja
              ? 'CLF・SAA・SAP など全資格に対応'
              : 'CLF, SAA, SAP and all certifications'}
          </div>
          <div style={{
            marginTop: 20,
            display: 'inline-block',
            padding: '8px 24px',
            background: 'var(--color-primary)',
            color: 'white',
            borderRadius: 'var(--border-radius-full)',
            fontSize: 14,
            fontWeight: 700,
          }}>
            {ja ? '学習を始める' : 'Start Learning'}
          </div>
        </button>

        {/* 今後追加予定プレースホルダー */}
        <div style={{
          width: 260,
          padding: '32px 24px',
          background: 'var(--color-bg-main)',
          border: '2px dashed var(--color-border)',
          borderRadius: 16,
          textAlign: 'center',
          opacity: 0.6,
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 28,
          }}>
            +
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-text-sub)',
            marginBottom: 8,
          }}>
            {ja ? '今後追加予定' : 'Coming Soon'}
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--color-text-light)',
            lineHeight: 1.5,
          }}>
            {ja
              ? 'その他の資格試験を準備中です'
              : 'More certifications are being prepared'}
          </div>
        </div>
      </div>

      {/* フッター */}
      <p style={{
        marginTop: 60,
        fontSize: 12,
        color: 'var(--color-text-light)',
      }}>
        © {new Date().getFullYear()} MugenKnock
      </p>
    </div>
  );
}
