import React, { useEffect, useState } from 'react';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_LEVEL } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

type SessionSummary = { examType: string; count: number; lastDate: string | null };

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

export default function Account() {
  const { user } = useAuth();
  const { lang } = useLanguage();

  const [summaries, setSummaries] = useState<Record<string, SessionSummary>>({});
  const [loading, setLoading] = useState(true);
  const [confirmingExam, setConfirmingExam] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletedExams, setDeletedExams] = useState<Set<string>>(new Set());

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 'var(--font-size-sm)' }}>
            <span style={{ color: 'var(--color-text-light)', minWidth: 100 }}>{lang === 'ja' ? 'メールアドレス' : 'Email'}</span>
            <span style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>{user.email}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 'var(--font-size-sm)' }}>
            <span style={{ color: 'var(--color-text-light)', minWidth: 100 }}>{lang === 'ja' ? 'ユーザーID' : 'User ID'}</span>
            <span style={{ color: 'var(--color-text-sub)', fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>{user.userId}</span>
          </div>
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
            {EXAM_TYPES.map((et, i) => {
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
    </div>
  );
}
