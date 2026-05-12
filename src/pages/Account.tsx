import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword, deleteUser, updateUserAttributes } from 'aws-amplify/auth';
import { API_ENDPOINT, EXAM_TYPES, EXAM_LEVEL } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

const IconChevronLeft = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6"/>
  </svg>
);

type SessionSummary = { examType: string; count: number; lastDate: string | null };

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

const IconSun = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const IconMoon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const IconChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-light)', flexShrink: 0 }}>
    <path d="M9 18l6-6-6-6"/>
  </svg>
);

function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-bg-white)',
      borderRadius: 'var(--border-radius-lg)',
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function SettingsRow({
  label, value, onClick, danger = false, last = false,
}: {
  label: string; value?: React.ReactNode; onClick?: () => void; danger?: boolean; last?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center',
        padding: '14px 16px', border: 'none',
        borderBottom: last ? 'none' : '1px solid var(--color-border)',
        background: onClick && hovered ? 'var(--color-bg-main)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        color: danger ? 'var(--color-danger)' : 'var(--color-text-main)',
        fontSize: 'var(--font-size-base)',
        transition: 'background 0.15s',
        gap: 12,
      }}
    >
      <span style={{ flex: 1, fontWeight: 400 }}>{label}</span>
      {value !== undefined && (
        <span style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', marginRight: 4, flexShrink: 0 }}>
          {value}
        </span>
      )}
      {onClick && <IconChevronRight />}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 'var(--font-size-xs)', fontWeight: 700,
      color: 'var(--color-text-light)', textTransform: 'uppercase',
      letterSpacing: '0.5px', padding: '0 4px', marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '24px 24px 20px', width: '100%', maxWidth: 480, boxShadow: 'var(--box-shadow-md)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function TextInput({ type = 'text', value, onChange, placeholder, onFocus, onBlur }: {
  type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; onFocus?: () => void; onBlur?: () => void;
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none', background: 'var(--color-bg-white)', color: 'var(--color-text-main)' }}
      onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; onFocus?.(); }}
      onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; onBlur?.(); }}
    />
  );
}

export default function Account() {
  const { user, signOut } = useAuth();
  const { lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [summaries, setSummaries] = useState<Record<string, SessionSummary>>({});
  const [loading, setLoading] = useState(true);
  const [confirmingExam, setConfirmingExam] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletedExams, setDeletedExams] = useState<Set<string>>(new Set());

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [showDataSection, setShowDataSection] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showQuickModal, setShowQuickModal] = useState(false);

  const QUICK_PREFS_KEY = 'quickExercisePrefs';
  const loadQuickPrefs = () => {
    try { return JSON.parse(localStorage.getItem(QUICK_PREFS_KEY) ?? '{}'); } catch { return {}; }
  };
  const [quickPrefs, setQuickPrefs] = useState(() => loadQuickPrefs());

  const saveQuickPref = (key: string, value: any) => {
    const next = { ...loadQuickPrefs(), [key]: value };
    localStorage.setItem(QUICK_PREFS_KEY, JSON.stringify(next));
    setQuickPrefs(next);
  };

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
    } catch (err) { console.error(err); }
    finally { setDeleting(null); setConfirmingExam(null); }
  };

  const handlePasswordChange = async () => {
    if (!oldPassword || !newPassword) { setPasswordError(lang === 'ja' ? 'すべてのフィールドを入力してください' : 'Please fill all fields'); return; }
    if (newPassword !== confirmPassword) { setPasswordError(lang === 'ja' ? 'パスワードが一致しません' : 'Passwords do not match'); return; }
    if (newPassword.length < 8) { setPasswordError(lang === 'ja' ? 'パスワードは8文字以上にしてください' : 'Password must be at least 8 characters'); return; }
    setPasswordChanging(true); setPasswordError('');
    try {
      await updatePassword({ oldPassword, newPassword });
      setPasswordSuccess(true);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => { setShowPasswordModal(false); setPasswordSuccess(false); }, 2000);
    } catch (err: any) {
      setPasswordError(err.message || (lang === 'ja' ? 'パスワード変更に失敗しました' : 'Failed to change password'));
    } finally { setPasswordChanging(false); }
  };

  const handleEmailChange = async () => {
    if (!newEmail) { setEmailError(lang === 'ja' ? 'メールアドレスを入力してください' : 'Please enter email address'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setEmailError(lang === 'ja' ? '有効なメールアドレスを入力してください' : 'Please enter a valid email address'); return; }
    setEmailChanging(true); setEmailError('');
    try {
      await updateUserAttributes({ userAttributes: { email: newEmail } });
      setEmailSuccess(true); setNewEmail('');
      setTimeout(() => { setShowEmailModal(false); setEmailSuccess(false); }, 2000);
    } catch (err: any) {
      setEmailError(err.message || (lang === 'ja' ? 'メールアドレス変更に失敗しました' : 'Failed to change email'));
    } finally { setEmailChanging(false); }
  };

  const handleAccountDelete = async () => {
    if (deleteConfirmation.toLowerCase() !== 'delete') { setDeleteError(lang === 'ja' ? '"DELETE"と入力してください' : 'Please type "DELETE" to confirm'); return; }
    setAccountDeleting(true); setDeleteError('');
    try {
      await deleteUser();
      await signOut();
      navigate('/login', { replace: true });
    } catch (err: any) {
      setDeleteError(err.message || (lang === 'ja' ? 'アカウント削除に失敗しました' : 'Failed to delete account'));
      setAccountDeleting(false);
    }
  };

  const ja = lang === 'ja';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--color-bg-main)', fontFamily: 'inherit' }}>

      {/* ── ヘッダー ── */}
      <header style={{
        height: 56, minHeight: 56, background: 'var(--color-secondary)',
        display: 'flex', alignItems: 'center',
        padding: '0 8px 0 4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, border: 'none', background: 'none',
            cursor: 'pointer', color: 'white', borderRadius: 8,
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <IconChevronLeft />
        </button>
        <div onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <img src="/mugen-header.png" alt="AWS資格無限ノック" style={{ height: 32, width: 'auto', display: 'block' }} />
        </div>
      </header>

    <div style={{ flex: 1, overflowY: 'auto' }}>
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 48px' }} className="page-container">

      {/* ユーザー情報ヘッダー */}
      {user && (
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--color-secondary)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 700, margin: '0 auto 12px',
          }}>
            {(user.email?.[0] ?? '?').toUpperCase()}
          </div>
          <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-main)', marginBottom: 2 }}>
            {user.email?.split('@')[0]}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
            {user.email}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* アカウント設定 */}
        {user && (
          <div>
            <SectionTitle>{ja ? 'アカウント設定' : 'Account'}</SectionTitle>
            <SettingsGroup>
              <SettingsRow
                label={ja ? 'メールアドレス' : 'Email'}
                value={user.email}
                onClick={() => { setEmailError(''); setEmailSuccess(false); setNewEmail(''); setShowEmailModal(true); }}
              />
              <SettingsRow
                label={ja ? 'パスワード' : 'Password'}
                value="••••••••"
                onClick={() => { setPasswordError(''); setPasswordSuccess(false); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); setShowPasswordModal(true); }}
                last
              />
            </SettingsGroup>
          </div>
        )}

        {/* サクッと演習設定 */}
        <div>
          <SectionTitle>{ja ? 'サクッと演習 設定' : 'Quick Practice Settings'}</SectionTitle>
          <SettingsGroup>
            <SettingsRow
              label={ja ? '問題数' : 'Question Count'}
              value={`${quickPrefs.questionCount ?? 5}${ja ? '問' : 'Q'}`}
              onClick={() => setShowQuickModal(true)}
            />
            <SettingsRow
              label={ja ? '未回答のみ' : 'Unanswered Only'}
              value={quickPrefs.unansweredOnly ? 'ON' : 'OFF'}
              onClick={() => saveQuickPref('unansweredOnly', !(quickPrefs.unansweredOnly ?? false))}
            />
            <SettingsRow
              label={ja ? '不正解のみ' : 'Incorrect Only'}
              value={quickPrefs.incorrectOnly ? 'ON' : 'OFF'}
              onClick={() => saveQuickPref('incorrectOnly', !(quickPrefs.incorrectOnly ?? false))}
            />
            <SettingsRow
              label={ja ? 'ブックマークのみ' : 'Bookmarked Only'}
              value={quickPrefs.bookmarkOnly ? 'ON' : 'OFF'}
              onClick={() => saveQuickPref('bookmarkOnly', !(quickPrefs.bookmarkOnly ?? false))}
              last
            />
          </SettingsGroup>
          <div style={{ marginTop: 6, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', padding: '0 4px' }}>
            {ja ? '※ AI確認済み問題のみが常に対象です' : '* AI-verified questions are always included'}
          </div>
        </div>

        {/* 表示設定 */}
        <div>
          <SectionTitle>{ja ? '表示設定' : 'Display'}</SectionTitle>
          <SettingsGroup>
            <SettingsRow
              label={ja ? '言語' : 'Language'}
              value={lang === 'ja' ? '日本語' : 'English'}
              onClick={() => setShowLangModal(true)}
            />
            <SettingsRow
              label={ja ? '外観' : 'Appearance'}
              value={theme === 'light' ? (ja ? 'ライト' : 'Light') : (ja ? 'ダーク' : 'Dark')}
              onClick={() => setShowThemeModal(true)}
              last
            />
          </SettingsGroup>
        </div>

        {/* データ管理 */}
        {user && (
          <div>
            <SectionTitle>{ja ? 'データ管理' : 'Data'}</SectionTitle>
            <SettingsGroup>
              <SettingsRow
                label={ja ? '試験データの管理' : 'Manage Exam Data'}
                onClick={() => setShowDataSection(prev => !prev)}
                last={!showDataSection}
              />
              {showDataSection && (
                <div style={{ padding: '4px 0 8px', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ margin: '12px 16px 8px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
                    {ja
                      ? '各資格の回答履歴・セッション・統計データを削除できます。削除したデータは復元できません。'
                      : 'Delete answer history, sessions, and stats for each certification. This action cannot be undone.'}
                  </p>
                  {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                      <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                    </div>
                  ) : (
                    <div>
                      {EXAM_TYPES.filter(et => summaries[et] && !deletedExams.has(et)).map((et, i, arr) => {
                        const summary = summaries[et];
                        const isConfirming = confirmingExam === et;
                        const isDeleting = deleting === et;
                        const hasData = !!summary;
                        return (
                          <div key={et} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 16px',
                            borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Badge variant="secondary">{et}</Badge>
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>{EXAM_LEVEL[et]}</span>
                              </div>
                              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                                {ja ? `${summary.count}セッション` : `${summary.count} sessions`}
                                {summary.lastDate && ` · ${ja ? '最終' : 'Last'}: ${formatDate(summary.lastDate)}`}
                              </div>
                            </div>
                            {isConfirming ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)' }}>{ja ? '削除しますか？' : 'Delete?'}</span>
                                <button onClick={() => handleDelete(et)} disabled={isDeleting} style={{ padding: '4px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--color-danger)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-danger)', color: 'white', opacity: isDeleting ? 0.6 : 1 }}>
                                  {isDeleting ? '…' : (ja ? 'はい' : 'Yes')}
                                </button>
                                <button onClick={() => setConfirmingExam(null)} disabled={isDeleting} style={{ padding: '4px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', background: 'transparent', color: 'var(--color-text-sub)' }}>
                                  {ja ? 'キャンセル' : 'Cancel'}
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmingExam(et)} disabled={!hasData} style={{ padding: '5px 12px', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: hasData ? 'pointer' : 'default', border: `1.5px solid ${hasData ? 'var(--color-danger)' : 'var(--color-border)'}`, borderRadius: 'var(--border-radius-md)', background: 'transparent', color: hasData ? 'var(--color-danger)' : 'var(--color-text-light)', flexShrink: 0 }}>
                                {ja ? 'データを削除' : 'Delete data'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {EXAM_TYPES.filter(et => summaries[et] && !deletedExams.has(et)).length === 0 && (
                        <div style={{ padding: '12px 16px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
                          {ja ? '削除可能なデータがありません' : 'No data to delete'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SettingsGroup>
          </div>
        )}

        {/* ログアウト */}
        {user && (
          <div>
            <SettingsGroup>
              <SettingsRow
                label={ja ? 'ログアウト' : 'Sign Out'}
                onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
                last
              />
            </SettingsGroup>
          </div>
        )}

        {/* ログイン */}
        {!user && (
          <div>
            <SettingsGroup>
              <SettingsRow label={ja ? 'ログイン' : 'Sign In'} onClick={() => navigate('/login')} last />
            </SettingsGroup>
          </div>
        )}

        {/* アカウント削除 */}
        {user && (
          <div>
            <SettingsGroup>
              <SettingsRow
                label={ja ? 'アカウントを削除' : 'Delete Account'}
                onClick={() => { setDeleteConfirmation(''); setDeleteError(''); setShowDeleteModal(true); }}
                danger last
              />
            </SettingsGroup>
          </div>
        )}
      </div>

      {/* ── サクッと演習 問題数モーダル ── */}
      {showQuickModal && (
        <Modal onClose={() => setShowQuickModal(false)} title={ja ? 'サクッと演習の問題数' : 'Quick Practice Question Count'}>
          <p style={{ margin: '0 0 16px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
            {ja ? 'ホーム画面の「サクッと演習」で出題する問題数を設定します。' : 'Set the number of questions for Quick Practice on the home screen.'}
          </p>
          <div style={{ marginBottom: 20 }}>
            <FieldLabel>{ja ? '問題数（1〜20問）' : 'Count (1–20)'}</FieldLabel>
            <input
              type="number"
              min={1} max={20}
              value={quickPrefs.questionCount ?? 5}
              onChange={e => saveQuickPref('questionCount', Math.min(20, Math.max(1, parseInt(e.target.value) || 5)))}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
            />
          </div>
          <Button onClick={() => setShowQuickModal(false)} variant="primary" style={{ width: '100%' }}>
            {ja ? '保存する' : 'Save'}
          </Button>
        </Modal>
      )}

      {/* ── メールアドレス変更モーダル ── */}
      {showEmailModal && (
        <Modal onClose={() => setShowEmailModal(false)} title={ja ? 'メールアドレス変更' : 'Change Email'}>
          {emailSuccess ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--color-success)' }}>✓</div>
              <p style={{ color: 'var(--color-success)', fontWeight: 700, margin: 0 }}>
                {ja ? 'メールアドレスを変更しました' : 'Email changed successfully'}
              </p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>{ja ? '現在のメールアドレス' : 'Current Email'}</FieldLabel>
                <div style={{ padding: '9px 12px', background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)' }}>
                  {user?.email}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <FieldLabel>{ja ? '新しいメールアドレス' : 'New Email'} <span style={{ color: 'var(--color-danger)' }}>*</span></FieldLabel>
                <TextInput type="email" value={newEmail} onChange={setNewEmail} placeholder={ja ? '新しいメールアドレス' : 'New email address'} />
              </div>
              {emailError && <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>{emailError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={handleEmailChange} disabled={emailChanging} variant="primary" style={{ flex: 1 }}>
                  {emailChanging ? (ja ? '変更中...' : 'Changing...') : (ja ? '変更する' : 'Change')}
                </Button>
                <Button onClick={() => setShowEmailModal(false)} variant="outline" disabled={emailChanging}>{ja ? 'キャンセル' : 'Cancel'}</Button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ── パスワード変更モーダル ── */}
      {showPasswordModal && (
        <Modal onClose={() => !passwordChanging && setShowPasswordModal(false)} title={ja ? 'パスワード変更' : 'Change Password'}>
          {passwordSuccess ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--color-success)' }}>✓</div>
              <p style={{ color: 'var(--color-success)', fontWeight: 700, margin: 0 }}>
                {ja ? 'パスワードを変更しました' : 'Password changed successfully'}
              </p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>{ja ? '現在のパスワード' : 'Current Password'}</FieldLabel>
                <TextInput type="password" value={oldPassword} onChange={setOldPassword} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>{ja ? '新しいパスワード' : 'New Password'}</FieldLabel>
                <TextInput type="password" value={newPassword} onChange={setNewPassword} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <FieldLabel>{ja ? 'パスワード確認' : 'Confirm Password'}</FieldLabel>
                <TextInput type="password" value={confirmPassword} onChange={setConfirmPassword} />
              </div>
              {passwordError && <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>{passwordError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={handlePasswordChange} disabled={passwordChanging} variant="primary" style={{ flex: 1 }}>
                  {passwordChanging ? (ja ? '変更中...' : 'Changing...') : (ja ? '変更する' : 'Change')}
                </Button>
                <Button onClick={() => setShowPasswordModal(false)} variant="outline" disabled={passwordChanging}>{ja ? 'キャンセル' : 'Cancel'}</Button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ── 言語選択モーダル ── */}
      {showLangModal && (
        <Modal onClose={() => setShowLangModal(false)} title={ja ? '言語' : 'Language'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
            {([['ja', '日本語'], ['en', 'English']] as const).map(([l, label], i, arr) => (
              <button
                key={l}
                onClick={() => { setLang(l); setShowLangModal(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', border: 'none',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
                  background: lang === l ? 'var(--color-primary-light)' : 'transparent',
                  cursor: 'pointer', fontSize: 'var(--font-size-base)',
                  color: lang === l ? 'var(--color-primary)' : 'var(--color-text-main)',
                  fontWeight: lang === l ? 700 : 400,
                }}
              >
                <span>{label}</span>
                {lang === l && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── 外観選択モーダル ── */}
      {showThemeModal && (
        <Modal onClose={() => setShowThemeModal(false)} title={ja ? '外観' : 'Appearance'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
            {([['light', ja ? 'ライト' : 'Light', <IconSun />], ['dark', ja ? 'ダーク' : 'Dark', <IconMoon />]] as const).map(([th, label, icon], i, arr) => (
              <button
                key={th}
                onClick={() => { if (theme !== th) toggleTheme(); setShowThemeModal(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '14px 16px', border: 'none',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
                  background: theme === th ? 'var(--color-primary-light)' : 'transparent',
                  cursor: 'pointer', fontSize: 'var(--font-size-base)',
                  color: theme === th ? 'var(--color-primary)' : 'var(--color-text-main)',
                  fontWeight: theme === th ? 700 : 400,
                }}
              >
                <span style={{ color: theme === th ? 'var(--color-primary)' : 'var(--color-text-sub)' }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
                {theme === th && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── アカウント削除モーダル ── */}
      {showDeleteModal && (
        <Modal onClose={() => !accountDeleting && setShowDeleteModal(false)} title={ja ? 'アカウントを削除' : 'Delete Account'}>
          <p style={{ margin: '0 0 16px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
            {ja
              ? 'アカウントを完全に削除します。この操作は取り消せません。すべてのデータが失われます。'
              : 'This will permanently delete your account. This action cannot be undone. All your data will be lost.'}
          </p>
          <div style={{ marginBottom: 20 }}>
            <FieldLabel>{ja ? '確認のため "DELETE" と入力してください' : 'Type "DELETE" to confirm'}</FieldLabel>
            <TextInput value={deleteConfirmation} onChange={setDeleteConfirmation} placeholder="DELETE" />
          </div>
          {deleteError && <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>{deleteError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleAccountDelete} disabled={accountDeleting || deleteConfirmation.toLowerCase() !== 'delete'} variant="primary" style={{ flex: 1, background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>
              {accountDeleting ? (ja ? '削除中...' : 'Deleting...') : (ja ? '削除する' : 'Delete')}
            </Button>
            <Button onClick={() => setShowDeleteModal(false)} variant="outline" disabled={accountDeleting}>{ja ? 'キャンセル' : 'Cancel'}</Button>
          </div>
        </Modal>
      )}
    </div>
    </div>
    </div>
  );
}
