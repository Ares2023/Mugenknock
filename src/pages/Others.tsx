import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { API_ENDPOINT } from '../constants';
import { IconList, IconSparkles, IconFire, IconInfo, IconMail } from '../components/Icons';
import Button from '../components/ui/Button';

const ITEMS = [
  { path: '/questions',     Icon: IconList,      ja: '問題一覧',       en: 'Question List',   desc_ja: 'すべての問題を参照・検索',      desc_en: 'Browse all questions'    },
  { path: '/growth',        Icon: IconSparkles,  ja: '成長記録',       en: 'Growth',          desc_ja: '学習の成長を振り返る',           desc_en: 'Track your learning progress' },
  { path: '/release-notes', Icon: IconFire,      ja: 'リリースノート', en: 'Release Notes',   desc_ja: 'アップデート情報',               desc_en: 'App update history'       },
  { path: '/architecture',  Icon: IconInfo,      ja: 'アーキテクチャ', en: 'Architecture',    desc_ja: 'AWSアーキテクチャ参考資料',      desc_en: 'AWS architecture references' },
];

export default function Others() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const ja = lang === 'ja';

  const [showContact, setShowContact] = useState(false);
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactDone, setContactDone] = useState(false);
  const [contactError, setContactError] = useState(false);

  const handleContactSend = async () => {
    if (!contactMessage.trim()) return;
    setContactSending(true);
    setContactError(false);
    try {
      const res = await fetch(`${API_ENDPOINT}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.userId ?? 'anonymous',
          subject: contactSubject.trim(),
          message: contactMessage.trim(),
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setContactDone(true);
      setContactSubject('');
      setContactMessage('');
    } catch {
      setContactError(true);
    } finally {
      setContactSending(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 'var(--spacing-lg)' }}>
      <h2 style={{ margin: '0 0 var(--spacing-lg)', fontSize: 'var(--font-size-h2)', fontWeight: 700, color: 'var(--color-text-main)' }}>
        {ja ? 'その他' : 'More'}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {ITEMS.map(({ path, Icon, ja: jaLabel, en: enLabel, desc_ja, desc_en }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px var(--spacing-md)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius-lg)', background: 'var(--color-bg-white)',
              cursor: 'pointer', textAlign: 'left', transition: 'box-shadow 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,108,224,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--border-radius-md)', flexShrink: 0,
              background: 'var(--color-primary-light)', color: 'var(--color-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 2 }}>
                {ja ? jaLabel : enLabel}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
                {ja ? desc_ja : desc_en}
              </div>
            </div>
            <span style={{ color: 'var(--color-text-light)', fontSize: 16, flexShrink: 0 }}>›</span>
          </button>
        ))}

        {/* お問い合わせ */}
        <button
          onClick={() => { setShowContact(true); setContactDone(false); setContactError(false); }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 16,
            padding: '16px var(--spacing-md)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-lg)', background: 'var(--color-bg-white)',
            cursor: 'pointer', textAlign: 'left', transition: 'box-shadow 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,108,224,0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--border-radius-md)', flexShrink: 0,
            background: 'var(--color-primary-light)', color: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconMail />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 2 }}>
              {t('contact.sidebarLabel')}
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
              {ja ? 'ご意見・不具合報告' : 'Send feedback or report issues'}
            </div>
          </div>
          <span style={{ color: 'var(--color-text-light)', fontSize: 16, flexShrink: 0 }}>›</span>
        </button>
      </div>

      {/* お問い合わせモーダル */}
      {showContact && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowContact(false); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 24px 20px', width: '100%', maxWidth: 480, boxShadow: 'var(--box-shadow-md)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>{t('contact.title')}</h3>
              <button onClick={() => setShowContact(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px' }}>✕</button>
            </div>
            {contactDone ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 'var(--spacing-md)' }}>✓</div>
                <p style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 'var(--font-size-md)', margin: '0 0 var(--spacing-sm)' }}>{t('contact.sent')}</p>
                <p style={{ color: 'var(--color-text-sub)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-lg)' }}>{t('contact.thankYou')}</p>
                <Button onClick={() => setShowContact(false)} size="md">{t('contact.close')}</Button>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: 'var(--spacing-sm) var(--spacing-md)', lineHeight: 1.6 }}>
                  {t('contact.anonymous')}
                </p>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>{t('contact.subject')}</div>
                  <input
                    value={contactSubject}
                    onChange={e => setContactSubject(e.target.value)}
                    placeholder={t('contact.subjectPlaceholder')}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>{t('contact.message')} <span style={{ color: 'var(--color-danger)' }}>*</span></div>
                  <textarea
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    placeholder={t('contact.messagePlaceholder')}
                    rows={5}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                {contactError && (
                  <p style={{ margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>
                    {ja ? '送信に失敗しました。しばらく経ってから再試行してください。' : 'Failed to send. Please try again later.'}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <Button onClick={handleContactSend} disabled={contactSending || !contactMessage.trim()} variant="primary" style={{ flex: 1 }}>
                    {contactSending ? t('contact.sending') : t('contact.send')}
                  </Button>
                  <Button onClick={() => setShowContact(false)} variant="outline">{t('contact.cancel')}</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
