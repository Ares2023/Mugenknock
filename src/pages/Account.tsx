import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword, deleteUser, updateUserAttributes } from 'aws-amplify/auth';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_LEVEL } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

type SessionSummary = { examType: string; count: number; lastDate: string | null };

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

export default function Account() {
  const { user, signOut } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const [summaries, setSummaries] = useState<Record<string, SessionSummary>>({});
  const [loading, setLoading] = useState(true);
  const [confirmingExam, setConfirmingExam] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletedExams, setDeletedExams] = useState<Set<string>>(new Set());

  // Password change
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Email change
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Account deletion
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!user) return;
    fetch(`${API_ENDPOINT}/users/me/sessions?userId=${user.userId}&limit=1000`)
      .then(r => r.json())
      .then(d => {
        const map: Record<string, SessionSummary> = {};
        for (const s of d.items ?? []) {
          const et = s.examType;
          if (!map[et]) map[et] = { examType: et, count: 0, lastDate: null };
          map[et].count++;
          const date = s.endedAt || s.startedAt;
          if (!map[et].lastDate || date > map[et].lastDate!) map[et].lastDate = date;
        }
        setSummaries(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const handleDelete = async (et: string) => {
    if (!user) return;
    setDeleting(et);
    try {
      await fetch(`${API_ENDPOINT}/users/me/data?userId=${user.userId}&examType=${et}`, { method: 'DELETE' });
      setDeletedExams(prev => new Set(prev).add(et));
      setSummaries(prev => { const next = { ...prev }; delete next[et]; return next; });
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
      setConfirmingExam(null);
    }
  };

  const handlePasswordChange = async () => {
    if (!oldPassword || !newPassword) {
      setPasswordError(lang === 'ja' ? 'すべてのフィールドを入力してください' : 'Please fill all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(lang === 'ja' ? 'パスワードが一致しません' : 'Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(lang === 'ja' ? 'パスワードは8文字以上にしてください' : 'Password must be at least 8 characters');
      return;
    }

    setPasswordChanging(true);
    setPasswordError('');
    try {
      await updatePassword({ oldPassword, newPassword });
      setPasswordSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setPasswordError(err.message || (lang === 'ja' ? 'パスワード変更に失敗しました' : 'Failed to change password'));
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleEmailChange = async () => {
    if (!newEmail) {
      setEmailError(lang === 'ja' ? 'メールアドレスを入力してください' : 'Please enter email address');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setEmailError(lang === 'ja' ? '有効なメールアドレスを入力してください' : 'Please enter a valid email address');
      return;
    }

    setEmailChanging(true);
    setEmailError('');
    try {
      await updateUserAttributes({
        userAttributes: { email: newEmail }
      });
      setEmailSuccess(true);
      setNewEmail('');
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSuccess(false);
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setEmailError(err.message || (lang === 'ja' ? 'メールアドレス変更に失敗しました' : 'Failed to change email'));
    } finally {
      setEmailChanging(false);
    }
  };

  const handleAccountDelete = async () => {
    if (deleteConfirmation.toLowerCase() !== 'delete') {
      setDeleteError(lang === 'ja' ? '"DELETE"と入力してください' : 'Please type "DELETE" to confirm');
      return;
    }

    setAccountDeleting(true);
    setDeleteError('');
    try {
      await deleteUser();
      await signOut();
      navigate('/login', { replace: true });
    } catch (err: any) {
      console.error(err);
      setDeleteError(err.message || (lang === 'ja' ? 'アカウント削除に失敗しました' : 'Failed to delete account'));
      setAccountDeleting(false);
    }
  };

  if (!user) return null;

  const sectionTitle: React.CSSProperties = {
    fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-light)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12,
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-xxl)', fontWeight: 700, color: 'var(--color-text-main)' }}>
          {lang === 'ja' ? 'アカウント管理' : 'Account'}
        </h1>
      </div>

      {/* アカウント情報 */}
      <Card padding="var(--spacing-lg)" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div style={sectionTitle}>{lang === 'ja' ? 'アカウント情報' : 'Account Info'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 'var(--font-size-sm)' }}>
            <span style={{ color: 'var(--color-text-light)', minWidth: 100 }}>{lang === 'ja' ? 'メールアドレス' : 'Email'}</span>
            <span style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>{user.email}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 'var(--font-size-sm)' }}>
            <span style={{ color: 'var(--color-text-light)', minWidth: 100 }}>{lang === 'ja' ? 'ユーザーID' : 'User ID'}</span>
            <span style={{ color: 'var(--color-text-sub)', fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>{user.userId}</span>
          </div>
        </div>

        {/* Account actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEmailModal(true)}
          >
            {lang === 'ja' ? 'メールアドレス変更' : 'Change Email'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPasswordModal(true)}
          >
            {lang === 'ja' ? 'パスワード変更' : 'Change Password'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            {lang === 'ja' ? 'ログアウト' : 'Logout'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
            style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
          >
            {lang === 'ja' ? 'アカウント削除' : 'Delete Account'}
          </Button>
        </div>
      </Card>

      {/* 試験データ管理 */}
      <Card padding="var(--spacing-lg)">
        <div style={sectionTitle}>{lang === 'ja' ? '試験データの管理' : 'Exam Data'}</div>
        <p style={{ margin: '0 0 16px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
          {lang === 'ja'
            ? '各資格の回答履歴・セッション・統計データを削除できます。削除したデータは復元できません。'
            : 'Delete answer history, sessions, and stats for each certification. This action cannot be undone.'}
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {EXAM_TYPES.filter(et => summaries[et] && !deletedExams.has(et)).map((et, i) => {
              const summary = summaries[et];
              const isDeleted = deletedExams.has(et);
              const isConfirming = confirmingExam === et;
              const isDeleting = deleting === et;
              const hasData = !!summary && !isDeleted;

              return (
                <div key={et} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 0',
                  borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                  opacity: isDeleted ? 0.4 : 1,
                }}>
                  {/* 資格情報 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <Badge variant="secondary">{et}</Badge>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>{EXAM_LEVEL[et]}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', fontWeight: 600, marginBottom: 2 }}>
                      {EXAM_CONFIGS[et].fullName}
                    </div>
                    {isDeleted ? (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)' }}>
                        {lang === 'ja' ? '削除しました' : 'Deleted'}
                      </div>
                    ) : hasData ? (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                        {lang === 'ja' ? `${summary.count}セッション` : `${summary.count} sessions`}
                        {summary.lastDate && ` · ${lang === 'ja' ? '最終' : 'Last'}: ${formatDate(summary.lastDate)}`}
                      </div>
                    ) : (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
                        {lang === 'ja' ? 'データなし' : 'No data'}
                      </div>
                    )}
                  </div>

                  {/* 削除ボタン / 確認 */}
                  {!isDeleted && (
                    isConfirming ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)' }}>
                          {lang === 'ja' ? '削除しますか？' : 'Delete?'}
                        </span>
                        <button
                          onClick={() => handleDelete(et)}
                          disabled={isDeleting}
                          style={{
                            padding: '4px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer',
                            border: '1.5px solid var(--color-danger)', borderRadius: 'var(--border-radius-md)',
                            background: 'var(--color-danger)', color: 'white', transition: 'opacity 0.15s',
                            opacity: isDeleting ? 0.6 : 1,
                          }}
                        >
                          {isDeleting ? '…' : (lang === 'ja' ? 'はい' : 'Yes')}
                        </button>
                        <button
                          onClick={() => setConfirmingExam(null)}
                          disabled={isDeleting}
                          style={{
                            padding: '4px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer',
                            border: '1.5px solid var(--color-border)', borderRadius: 'var(--border-radius-md)',
                            background: 'transparent', color: 'var(--color-text-sub)', transition: 'all 0.15s',
                          }}
                        >
                          {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingExam(et)}
                        disabled={!hasData}
                        style={{
                          padding: '5px 12px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: hasData ? 'pointer' : 'default',
                          border: `1.5px solid ${hasData ? 'var(--color-danger)' : 'var(--color-border)'}`,
                          borderRadius: 'var(--border-radius-md)',
                          background: 'transparent',
                          color: hasData ? 'var(--color-danger)' : 'var(--color-text-light)',
                          transition: 'all 0.15s', flexShrink: 0,
                        }}
                      >
                        {lang === 'ja' ? 'データを削除' : 'Delete data'}
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}
          onClick={e => { if (e.target === e.currentTarget && !passwordChanging) setShowPasswordModal(false); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '28px 32px', width: '100%', maxWidth: 480, boxShadow: 'var(--box-shadow-md)' }}>
            <h3 style={{ margin: '0 0 var(--spacing-lg)', fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>
              {lang === 'ja' ? 'パスワード変更' : 'Change Password'}
            </h3>
            {passwordSuccess ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 'var(--spacing-md)', color: 'var(--color-success)' }}>✓</div>
                <p style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 'var(--font-size-md)', margin: 0 }}>
                  {lang === 'ja' ? 'パスワードを変更しました' : 'Password changed successfully'}
                </p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
                    {lang === 'ja' ? '現在のパスワード' : 'Current Password'}
                  </label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
                    {lang === 'ja' ? '新しいパスワード' : 'New Password'}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
                    {lang === 'ja' ? 'パスワード確認' : 'Confirm Password'}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                {passwordError && (
                  <p style={{ margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>
                    {passwordError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <Button onClick={handlePasswordChange} disabled={passwordChanging} variant="primary" style={{ flex: 1 }}>
                    {passwordChanging ? (lang === 'ja' ? '変更中...' : 'Changing...') : (lang === 'ja' ? '変更' : 'Change')}
                  </Button>
                  <Button onClick={() => setShowPasswordModal(false)} variant="outline" disabled={passwordChanging}>
                    {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Email Change Modal */}
      {showEmailModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}
          onClick={e => { if (e.target === e.currentTarget && !emailChanging) setShowEmailModal(false); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '28px 32px', width: '100%', maxWidth: 480, boxShadow: 'var(--box-shadow-md)' }}>
            <h3 style={{ margin: '0 0 var(--spacing-lg)', fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>
              {lang === 'ja' ? 'メールアドレス変更' : 'Change Email'}
            </h3>
            {emailSuccess ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 'var(--spacing-md)', color: 'var(--color-success)' }}>✓</div>
                <p style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 'var(--font-size-md)', margin: 0 }}>
                  {lang === 'ja' ? 'メールアドレスを変更しました' : 'Email changed successfully'}
                </p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
                    {lang === 'ja' ? '現在のメールアドレス' : 'Current Email'}
                  </label>
                  <div style={{ padding: '8px 10px', background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)' }}>
                    {user.email}
                  </div>
                </div>
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
                    {lang === 'ja' ? '新しいメールアドレス' : 'New Email'}
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder={lang === 'ja' ? '新しいメールアドレスを入力' : 'Enter new email'}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  />
                </div>
                {emailError && (
                  <p style={{ margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>
                    {emailError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <Button onClick={handleEmailChange} disabled={emailChanging} variant="primary" style={{ flex: 1 }}>
                    {emailChanging ? (lang === 'ja' ? '変更中...' : 'Changing...') : (lang === 'ja' ? '変更' : 'Change')}
                  </Button>
                  <Button onClick={() => setShowEmailModal(false)} variant="outline" disabled={emailChanging}>
                    {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Account Deletion Modal */}
      {showDeleteModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}
          onClick={e => { if (e.target === e.currentTarget && !accountDeleting) setShowDeleteModal(false); }}
        >
          <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '28px 32px', width: '100%', maxWidth: 480, boxShadow: 'var(--box-shadow-md)' }}>
            <h3 style={{ margin: '0 0 var(--spacing-lg)', fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-danger)' }}>
              {lang === 'ja' ? 'アカウント削除' : 'Delete Account'}
            </h3>
            <p style={{ margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
              {lang === 'ja'
                ? 'アカウントを完全に削除します。この操作は取り消せません。すべてのデータが失われます。'
                : 'This will permanently delete your account. This action cannot be undone. All your data will be lost.'}
            </p>
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
                {lang === 'ja' ? '確認のため "DELETE" と入力してください' : 'Type "DELETE" to confirm'}
              </label>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={e => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-danger)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              />
            </div>
            {deleteError && (
              <p style={{ margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
              <Button
                onClick={handleAccountDelete}
                disabled={accountDeleting || deleteConfirmation.toLowerCase() !== 'delete'}
                variant="primary"
                style={{ flex: 1, background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
              >
                {accountDeleting ? (lang === 'ja' ? '削除中...' : 'Deleting...') : (lang === 'ja' ? '削除する' : 'Delete')}
              </Button>
              <Button onClick={() => setShowDeleteModal(false)} variant="outline" disabled={accountDeleting}>
                {lang === 'ja' ? 'キャンセル' : 'Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
