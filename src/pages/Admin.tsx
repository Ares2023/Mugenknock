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

type Tip = {
  tipId: string;
  examType: string;
  title: string;
  content: string;
};

type Tab = 'questions' | 'reports' | 'tips';

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

  // コラム管理
  const [tips, setTips] = useState<Tip[]>([]);
  const [loadingT, setLoadingT] = useState(false);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);
  const [tipForm, setTipForm] = useState({ examType: 'ALL', title: '', content: '' });
  const [showTipForm, setShowTipForm] = useState(false);

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

  const fetchTips = useCallback(async () => {
    setLoadingT(true);
    try {
      const res = await fetch(`${API_ENDPOINT}/admin/tips`);
      const data = await res.json();
      setTips(data.items || []);
    } catch (err) { console.error(err); } finally { setLoadingT(false); }
  }, []);

  useEffect(() => { fetchQuestions(); }, [examFilter]);
  useEffect(() => { if (tab === 'reports') fetchReports(); }, [tab]);
  useEffect(() => { if (tab === 'tips') fetchTips(); }, [tab]);

  const handleSaveTip = async () => {
    if (!tipForm.title.trim() || !tipForm.content.trim()) return;
    try {
      if (editingTip) {
        await fetch(`${API_ENDPOINT}/admin/tips/${editingTip.tipId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tipForm)
        });
      } else {
        await fetch(`${API_ENDPOINT}/admin/tips`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tipForm)
        });
      }
      setShowTipForm(false);
      setEditingTip(null);
      setTipForm({ examType: 'ALL', title: '', content: '' });
      fetchTips();
    } catch (err) { console.error(err); }
  };

  const handleDeleteTip = async (tip: Tip) => {
    if (!window.confirm(`「${tip.title}」を削除しますか？`)) return;
    try {
      await fetch(`${API_ENDPOINT}/admin/tips/${tip.tipId}`, { method: 'DELETE' });
      setTips(prev => prev.filter(t => t.tipId !== tip.tipId));
    } catch (err) { console.error(err); }
  };

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
    borderBottom: tab === t ? '3px solid #0073bb' : '3px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: (tab === t ? 'bold' : 'normal') as any,
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
        <button style={tabStyle('tips')} onClick={() => setTab('tips')}>コラム管理</button>
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
              style={{ padding: '6px 16px', background: '#0073bb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
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

      {/* ── コラム管理 ── */}
      {tab === 'tips' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
              {loadingT ? '読み込み中...' : `${tips.length} 件`}
            </p>
            <button onClick={() => { setEditingTip(null); setTipForm({ examType: 'ALL', title: '', content: '' }); setShowTipForm(true); }}
              style={{ padding: '7px 18px', background: '#0073bb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
              ＋ コラムを追加
            </button>
          </div>

          {/* フォーム */}
          {showTipForm && (
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 20, marginBottom: 20, background: '#fafafa' }}>
              <h4 style={{ margin: '0 0 14px', color: '#232f3e' }}>{editingTip ? 'コラムを編集' : '新規コラム'}</h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {['ALL', 'CLF', 'SAA', 'SAP'].map(t => (
                  <button key={t} type="button" onClick={() => setTipForm(f => ({ ...f, examType: t }))}
                    style={{ padding: '5px 12px', border: 'none', borderRadius: 4, cursor: 'pointer',
                      background: tipForm.examType === t ? '#232f3e' : '#eee',
                      color: tipForm.examType === t ? 'white' : '#333',
                      fontWeight: tipForm.examType === t ? 'bold' : 'normal' }}>
                    {t}
                  </button>
                ))}
              </div>
              <input
                value={tipForm.title}
                onChange={e => setTipForm(f => ({ ...f, title: e.target.value }))}
                placeholder="タイトル"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, marginBottom: 8, boxSizing: 'border-box' }}
              />
              <textarea
                value={tipForm.content}
                onChange={e => setTipForm(f => ({ ...f, content: e.target.value }))}
                placeholder="内容"
                rows={4}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={handleSaveTip}
                  style={{ padding: '7px 20px', background: '#232f3e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  保存
                </button>
                <button onClick={() => { setShowTipForm(false); setEditingTip(null); }}
                  style={{ padding: '7px 16px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: 'white' }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* コラム一覧 */}
          {tips.map(tip => (
            <div key={tip.tipId} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 16px', marginBottom: 8, background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  background: tip.examType === 'SAP' ? '#8e44ad' : tip.examType === 'SAA' ? '#2980b9' : tip.examType === 'CLF' ? '#27ae60' : '#888',
                  color: 'white', fontSize: 11, padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginTop: 2,
                }}>{tip.examType}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 'bold', fontSize: 14 }}>{tip.title}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.6 }}>{tip.content}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditingTip(tip); setTipForm({ examType: tip.examType, title: tip.title, content: tip.content }); setShowTipForm(true); }}
                    style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: 'white', fontSize: 12 }}>
                    編集
                  </button>
                  <button onClick={() => handleDeleteTip(tip)}
                    style={{ padding: '4px 10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loadingT && tips.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>コラムはありません</p>
          )}
        </div>
      )}
    </div>
  );
}
