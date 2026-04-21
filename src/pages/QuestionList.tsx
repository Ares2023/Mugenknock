import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT } from '../constants';
import Breadcrumb from '../components/Breadcrumb';

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  explanation?: string;
  tags: string[];
  isMultiple: boolean;
};

export default function QuestionList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [examType, setExamType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQuestions = async (type: string, kw: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type) params.set('examType', type);
      if (kw.trim()) params.set('keyword', kw.trim());
      const url = `${API_ENDPOINT}/questions${params.toString() ? '?' + params : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setQuestions(data.items || []);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const kw = params.get('keyword') || '';
    setKeyword(kw);
    fetchQuestions('', kw);
  }, [location.search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/questions${keyword.trim() ? '?keyword=' + encodeURIComponent(keyword.trim()) : ''}`);
  };

  const fetchDetail = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    try {
      const res = await fetch(`${API_ENDPOINT}/questions/${id}`);
      const data = await res.json();
      setQuestions(prev => prev.map(q => q.questionId === id ? { ...q, ...data } : q));
      setExpandedId(id);
    } catch (err) { console.error(err); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectAll = () => {
    selected.size === questions.length ? setSelected(new Set()) : setSelected(new Set(questions.map(q => q.questionId)));
  };

  const copyQuestion = (q: Question) => {
    const text = [
      `【問題】${q.questionText}`,
      q.choices.map((c, i) => `${i + 1}. ${c}`).join("\n"),
      q.correctAnswers ? `【正解】${q.correctAnswers.join(", ")}` : "",
      q.explanation ? `【解説】${q.explanation}` : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedId(q.questionId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const exportCSV = async () => {
    const targets = questions.filter(q => selected.has(q.questionId));
    const needFetch = targets.filter(q => !q.correctAnswers);
    const fetched = await Promise.all(needFetch.map(q => fetch(`${API_ENDPOINT}/questions/${q.questionId}`).then(r => r.json())));
    const map = Object.fromEntries(fetched.map(q => [q.questionId, q]));
    const full = targets.map(q => ({ ...q, ...map[q.questionId] }));
    const header = "問題ID,試験種別,問題文,選択肢,正解,解説\n";
    const rows = full.map(q => [q.questionId, q.examType, `"${q.questionText}"`, `"${q.choices.join(" / ")}"`, `"${(q.correctAnswers || []).join(" / ")}"`, `"${q.explanation || ""}"`].join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "questions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '問題一覧' }]} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ color: "#232f3e", margin: 0 }}>AWS資格問題一覧</h1>
      </div>

      <form onSubmit={handleSearch} style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="サービス名・キーワードで検索"
          style={{ flex: 1, padding: "6px 12px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14 }}
        />
        <button type="submit" style={{ padding: "6px 16px", background: "#0073bb", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
          検索
        </button>
        {keyword && (
          <button type="button" onClick={() => navigate('/questions')}
            style={{ padding: "6px 12px", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", background: "white" }}>
            クリア
          </button>
        )}
      </form>

      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        {["CLF", "SAA", "SAP"].map(type => (
          <button key={type} onClick={() => { setExamType(type); fetchQuestions(type, keyword); }}
            style={{ padding: "6px 16px", background: examType === type ? "#0073bb" : "#eee", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: examType === type ? "bold" : "normal" }}>
            {type}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button onClick={selectAll} style={{ padding: "6px 16px", cursor: "pointer" }}>
          {selected.size === questions.length ? "全解除" : "全選択"}
        </button>
        <button onClick={exportCSV} disabled={selected.size === 0}
          style={{ padding: "6px 16px", background: selected.size > 0 ? "#232f3e" : "#ccc", color: "white", border: "none", borderRadius: 4, cursor: selected.size > 0 ? "pointer" : "default" }}>
          {`CSV出力（${selected.size}件）`}
        </button>
      </div>

      {loading ? <p>読み込み中...</p> : questions.map(q => (
        <div key={q.questionId} style={{ border: "1px solid #ddd", borderRadius: 8, marginBottom: 12, padding: 16, background: selected.has(q.questionId) ? "#fff8ee" : "white" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <input type="checkbox" checked={selected.has(q.questionId)} onChange={() => toggleSelect(q.questionId)} style={{ marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <span style={{ background: "#0073bb", color: "white", borderRadius: 4, padding: "2px 8px", fontSize: 12, marginRight: 8 }}>{q.examType}</span>
              {q.isMultiple && <span style={{ background: "#5a9fd4", color: "white", borderRadius: 4, padding: "2px 8px", fontSize: 12, marginRight: 8 }}>複数選択</span>}
              <p style={{ margin: "8px 0", fontWeight: "bold" }}>{q.questionText}</p>
              <ol style={{ margin: "8px 0", paddingLeft: 20 }}>{q.choices.map((c, i) => <li key={i}>{c}</li>)}</ol>
              {expandedId === q.questionId && q.correctAnswers && (
                <div style={{ background: "#f0f8ff", borderRadius: 4, padding: 12, marginTop: 8 }}>
                  <p><strong>正解：</strong>{q.correctAnswers.join(", ")}</p>
                  <p><strong>解説：</strong>{q.explanation}</p>
                </div>
              )}
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button onClick={() => fetchDetail(q.questionId)} style={{ padding: "4px 12px", cursor: "pointer", borderRadius: 4, border: "1px solid #aaa" }}>
                  {expandedId === q.questionId ? "解説を閉じる" : "解説を見る"}
                </button>
                <button onClick={() => copyQuestion(q)}
                  style={{ padding: "4px 12px", cursor: "pointer", borderRadius: 4,
                    border: `1px solid ${copiedId === q.questionId ? '#27ae60' : '#aaa'}`,
                    color: copiedId === q.questionId ? '#27ae60' : 'inherit',
                    transition: 'color 0.2s, border-color 0.2s' }}>
                  {copiedId === q.questionId ? '✓ コピーしました' : 'コピー'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
