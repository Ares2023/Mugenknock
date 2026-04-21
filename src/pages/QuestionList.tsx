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
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 40px", color: '#16191f' }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '問題一覧' }]} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#16191f", margin: 0, fontSize: 24, fontWeight: 700 }}>AWS資格問題一覧</h1>
      </div>

      <form onSubmit={handleSearch} style={{ marginBottom: 20, display: "flex", gap: 12 }}>
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="サービス名・キーワードで検索"
          style={{ flex: 1, padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 2, fontSize: 14, outline: 'none' }}
          onFocus={e => e.currentTarget.style.borderColor = '#0073bb'}
          onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
        />
        <button type="submit"
          style={{ padding: "6px 20px", background: "white", color: "#0073bb", border: "1px solid #0073bb", borderRadius: 2, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f2f8fd"; e.currentTarget.style.borderColor = "#005a9e"; e.currentTarget.style.color = "#005a9e"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#0073bb"; e.currentTarget.style.color = "#0073bb"; }}
        >
          検索
        </button>
        {keyword && (
          <button type="button" onClick={() => navigate('/questions')}
            style={{ padding: "6px 20px", background: "white", color: "#545b64", border: "1px solid #545b64", borderRadius: 2, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f2f3f3"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "white"; }}
          >
            クリア
          </button>
        )}
      </form>

      <div style={{ marginBottom: 24, display: "flex", gap: 12 }}>
        {["CLF", "SAA", "SAP"].map(type => (
          <button key={type} onClick={() => { setExamType(type); fetchQuestions(type, keyword); }}
            style={{
              padding: "6px 20px",
              background: examType === type ? "#f2f8fd" : "white",
              border: "1px solid",
              borderColor: examType === type ? "#0073bb" : "#d1d5db",
              borderRadius: 2,
              cursor: "pointer",
              fontWeight: examType === type ? 700 : 400,
              color: examType === type ? "#0073bb" : "#545b64",
              transition: "all 0.1s"
            }}>
            {type}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 20, display: "flex", gap: 12, borderBottom: '1px solid #eaeded', paddingBottom: 16 }}>
        <button onClick={selectAll}
          style={{ padding: "6px 20px", background: "white", color: "#0073bb", border: "1px solid #0073bb", borderRadius: 2, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f2f8fd"; e.currentTarget.style.borderColor = "#005a9e"; e.currentTarget.style.color = "#005a9e"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#0073bb"; e.currentTarget.style.color = "#0073bb"; }}
        >
          {selected.size === questions.length ? "全選択を解除" : "すべて選択"}
        </button>
        <button onClick={exportCSV} disabled={selected.size === 0}
          style={{
            padding: "6px 20px",
            background: selected.size > 0 ? "white" : "#eaeded",
            color: selected.size > 0 ? "#16191f" : "#aab7b8",
            border: `1px solid ${selected.size > 0 ? "#545b64" : "transparent"}`,
            borderRadius: 2,
            cursor: selected.size > 0 ? "pointer" : "default",
            fontWeight: 700,
            fontSize: 14
          }}>
          {`CSV出力（${selected.size}件）`}
        </button>
      </div>

      {loading ? <p style={{ color: '#545b64' }}>読み込み中...</p> : questions.map(q => (
        <div key={q.questionId} style={{ border: "1px solid #eaeded", borderRadius: 2, marginBottom: 16, padding: 20, background: selected.has(q.questionId) ? "#f2f8fd" : "white", boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <input type="checkbox" checked={selected.has(q.questionId)} onChange={() => toggleSelect(q.questionId)} style={{ marginTop: 6, width: 16, height: 16 }} />
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 12 }}>
                <span style={{ background: "#232f3e", color: "white", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700, marginRight: 10 }}>{q.examType}</span>
                {q.isMultiple && <span style={{ background: "#f2f8fd", color: "#0073bb", borderRadius: 2, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>複数選択</span>}
              </div>
              <p style={{ margin: "0 0 12px", fontWeight: 400, fontSize: 15, lineHeight: 1.6 }}>{q.questionText}</p>
              <ol style={{ margin: "0 0 16px", paddingLeft: 24, fontSize: 14, color: '#545b64', lineHeight: 1.6 }}>{q.choices.map((c, i) => <li key={i}>{c}</li>)}</ol>
              {expandedId === q.questionId && q.correctAnswers && (
                <div style={{ background: "#f2fcf3", borderLeft: '4px solid #037f0c', borderRadius: 2, padding: "12px 16px", marginTop: 12, fontSize: 14 }}>
                  <p style={{ margin: "0 0 8px" }}><strong style={{ color: '#037f0c' }}>正解：</strong>{q.correctAnswers.join(", ")}</p>
                  <div style={{ color: '#16191f', lineHeight: 1.6 }}><strong>解説：</strong><div style={{ marginTop: 4 }}>{q.explanation}</div></div>
                </div>
              )}
              <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                <button onClick={() => fetchDetail(q.questionId)}
                  style={{ padding: "6px 16px", cursor: "pointer", borderRadius: 2, border: "1px solid #0073bb", background: "white", color: "#0073bb", fontWeight: 700, fontSize: 13 }}>
                  {expandedId === q.questionId ? "解説を隠す" : "解説を表示"}
                </button>
                <button onClick={() => copyQuestion(q)}
                  style={{
                    padding: "6px 16px", cursor: "pointer", borderRadius: 2,
                    border: `1px solid ${copiedId === q.questionId ? '#037f0c' : '#545b64'}`,
                    color: copiedId === q.questionId ? '#037f0c' : '#16191f',
                    background: copiedId === q.questionId ? '#f2fcf3' : 'white',
                    fontWeight: 700, fontSize: 13,
                    transition: 'all 0.2s'
                  }}>
                  {copiedId === q.questionId ? '✓ コピー済み' : 'コピー'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
