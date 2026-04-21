import React, { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINT, EXAM_TYPES } from '../constants';

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers: string[];
  explanation: string;
  tags: string[];
  isMultiple: boolean;
};

type Report = {
  questionId: string;
  reportId: string;
  userId: string;
  message: string;
  reportedAt: string;
};

type Tab = 'questions' | 'reports';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('questions');

  // 問題管理
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examFilter, setExamFilter] = useState('ALL');
  const [keyword, setKeyword] = useState('');
  const [loadingQ, setLoadingQ] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 通報
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingR, setLoadingR] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoadingQ(true);
    try {
      const params = new URLSearchParams();
      if (examFilter !== 'ALL') params.set('examType', examFilter);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await fetch(`${API_ENDPOINT}/admin/questions?${params}`);
      const data = await res.json();
      setQuestions(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQ(false);
    }
  }, [examFilter, keyword]);

  const fetchReports = useCallback(async () => {
    setLoadingR(true);
    try {
      const res = await fetch(`${API_ENDPOINT}/admin/reports`);
      const data = await res.json();
      setReports(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingR(false);
    }
  }, []);

  useEffect(() => { fetchQuestions(); }, [examFilter]);
  useEffect(() => { if (tab === 'reports') fetchReports(); }, [tab]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQuestions();
  };

  const handleDelete = async (q: Question) => {
    if (!window.confirm(`「${q.questionId}」を削除しますか？\n\n${q.questionText.slice(0, 60)}…`)) return;
    setDeletingId(q.questionId);
    try {
      const res = await fetch(`${API_ENDPOINT}/questions/${q.questionId}`, { method: 'DELETE' });
      if (res.ok) {
        setQuestions(prev => prev.filter(item => item.questionId !== q.questionId));
        if (expandedId === q.questionId) setExpandedId(null);
      } else {
        alert('削除に失敗しました');
      }
    } catch (err) {
      alert('削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  const tabStyle = (t: Tab) => ({
    padding: '10px 24px',
    border: 'none',
    borderBottom: tab === t ? '3px solid #ff9900' : '3px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: tab === t ? 'bold' : 'normal' as any,
    color: tab === t ? '#232f3e' : '#888',
    fontSize: 15,
  });

  const examBadge = (type: string) => (
    <span style={{
      background: type === 'SAP' ? '#8e44ad' : type === 'SAA' ? '#2980b9' : '#27ae60',
      color: 'white', fontSize: 11, padding: '2px 7px', borderRadius: 4, marginRight: 8,
    }}>{type}</span>
  );

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 32px', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginTop: 0, color: '#232f3e' }}>管理画面</h2>

      {/* タブ */}
      <div style={{ borderBottom: '1px solid #e0e0e0', marginBottom: 24 }}>
        <button style={tabStyle('questions')} onClick={() => setTab('questions')}>問題管理</button>
        <button style={tabStyle('reports')} onClick={() => setTab('reports')}>通報確認</button>
      </div>

      {/* ── 問題管理 ── */}
      {tab === 'questions' && (
        <div>
          {/* 検索バー */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {['ALL', ...EXAM_TYPES].map(type => (
                <button key={type} type="button" onClick={() => setExamFilter(type)}
                  style={{ padding: '6px 14px', border: 'none', borderRadius: 4, cursor: 'pointer',
                    background: examFilter === type ? '#232f3e' : '#eee',
                    color: examFilter === type ? 'white' : '#333',
                    fontWeight: examFilter === type ? 'bold' : 'normal' }}>
                  {type}
                </button>
              ))}
            </div>
            <input
              value={keyword} onChange={e => setKeyword(e.target.value)}
              placeholder="問題ID・問題文で検索"
              style={{ flex: 1, minWidth: 200, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14 }}
            />
            <button type="submit"
              style={{ padding: '6px 16px', background: '#ff9900', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              検索
            </button>
          </form>

          {/* 件数 */}
          <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
            {loadingQ ? '読み込み中...' : `${questions.length} 件`}
          </p>

          {/* 問題リスト */}
          {questions.map(q => (
            <div key={q.questionId} style={{ border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
              {/* ヘッダー行 */}
              <div
                onClick={() => setExpandedId(expandedId === q.questionId ? null : q.questionId)}
                style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', background: expandedId === q.questionId ? '#f5f5f5' : 'white', gap: 8 }}>
                <span style={{ color: '#bbb', fontSize: 13, flexShrink: 0 }}>{expandedId === q.questionId ? '▼' : '▶'}</span>
                {examBadge(q.examType)}
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888', flexShrink: 0, minWidth: 100 }}>{q.questionId}</span>
                <span style={{ fontSize: 14, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.questionText}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(q); }}
                  disabled={deletingId === q.questionId}
                  style={{ padding: '4px 12px', background: deletingId === q.questionId ? '#ccc' : '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                  {deletingId === q.questionId ? '削除中...' : '削除'}
                </button>
              </div>

              {/* 展開詳細 */}
              {expandedId === q.questionId && (
                <div style={{ padding: '14px 16px', borderTop: '1px solid #e8e8e8', background: '#fafafa', fontSize: 13 }}>
                  <p style={{ fontWeight: 'bold', marginTop: 0 }}>{q.questionText}</p>
                  {q.isMultiple && <p style={{ color: '#5a9fd4', fontSize: 12 }}>複数選択</p>}

                  <div style={{ marginBottom: 12 }}>
                    {q.choices.map((c, i) => {
                      const isCorrect = q.correctAnswers?.includes(c);
                      return (
                        <div key={i} style={{
                          padding: '6px 10px', marginBottom: 4, borderRadius: 4,
                          background: isCorrect ? '#eafaf1' : '#f5f5f5',
                          border: `1px solid ${isCorrect ? '#27ae60' : '#e0e0e0'}`,
                          color: isCorrect ? '#27ae60' : '#333',
                        }}>
                          {isCorrect ? '✓ ' : ''}{c}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ background: '#f0f8ff', borderRadius: 4, padding: '10px 12px', marginBottom: 10, color: '#555', lineHeight: 1.6 }}>
                    <strong>解説：</strong>{q.explanation}
                  </div>

                  <div style={{ color: '#888', fontSize: 12 }}>
                    タグ: {q.tags?.join(', ') || 'なし'}
                  </div>
                </div>
              )}
            </div>
          ))}

          {!loadingQ && questions.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>問題が見つかりません</p>
          )}
        </div>
      )}

      {/* ── 通報確認 ── */}
      {tab === 'reports' && (
        <div>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
            {loadingR ? '読み込み中...' : `${reports.length} 件`}
          </p>

          {reports.map(r => (
            <div key={r.reportId} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f5f5f5', padding: '2px 8px', borderRadius: 4, color: '#555' }}>
                    {r.questionId}
                  </span>
                  <span style={{ fontSize: 12, color: '#aaa', marginLeft: 12 }}>
                    {new Date(r.reportedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setTab('questions');
                    setKeyword(r.questionId);
                    setTimeout(() => fetchQuestions(), 100);
                  }}
                  style={{ fontSize: 12, padding: '3px 10px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: 'white', color: '#555' }}>
                  問題を確認
                </button>
              </div>
              <p style={{ margin: '0 0 6px', color: '#333' }}>{r.message || '（メッセージなし）'}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>通報者: {r.userId}</p>
            </div>
          ))}

          {!loadingR && reports.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>通報はありません</p>
          )}
        </div>
      )}
    </div>
  );
}
