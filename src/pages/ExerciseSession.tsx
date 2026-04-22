import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, PASS_RATE } from '../constants';
import Breadcrumb from '../components/Breadcrumb';

type Tip = { tipId: string; title: string; content: string; examType: string };

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

export default function ExerciseSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId, questions, userId, examType } = location.state as any;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [answered, setAnswered] = useState(false);
  const [detail, setDetail] = useState<Question | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/tips?examType=${examType}`)
      .then(r => r.json())
      .then(d => setTips(d.items ?? []))
      .catch(() => {});
  }, [examType]);
  const [results, setResults] = useState<{ questionId: string; isCorrect: boolean }[]>([]);
  const [loading, setLoading] = useState(false);

  const currentQuestion = questions[currentIndex];

  const fetchDetail = async (questionId: string): Promise<Question> => {
    const res = await fetch(`${API_ENDPOINT}/questions/${questionId}`);
    const data = await res.json();
    setDetail(data);
    return data;
  };

  const toggleAnswer = (choice: string) => {
    if (answered) return;
    if (currentQuestion.isMultiple) {
      setSelectedAnswers(prev =>
        prev.includes(choice) ? prev.filter(a => a !== choice) : [...prev, choice]
      );
    } else {
      setSelectedAnswers([choice]);
    }
  };

  const submitAnswer = async () => {
    if (selectedAnswers.length === 0) return;
    setLoading(true);
    const fetched = await fetchDetail(currentQuestion.questionId);
    const correctAnswers = fetched.correctAnswers || [];
    const isCorrect = correctAnswers.length === selectedAnswers.length &&
      correctAnswers.every(a => selectedAnswers.includes(a));

    try {
      await fetch(`${API_ENDPOINT}/sessions/${sessionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          questionId: currentQuestion.questionId,
          selectedAnswers,
          isCorrect,
          tags: currentQuestion.tags
        })
      });
    } catch (err) { console.error(err); }

    setResults(prev => [...prev, { questionId: currentQuestion.questionId, isCorrect }]);
    setAnswered(true);
    setLoading(false);
  };

  const nextQuestion = async () => {
    if (currentIndex + 1 >= questions.length) {
      const score = Math.round((results.filter(r => r.isCorrect).length / questions.length) * 100);
      const passRate = PASS_RATE[examType] ?? PASS_RATE['SAA'];
      const isPassed = score >= passRate;
      try {
        await fetch(`${API_ENDPOINT}/sessions/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, status: 'completed', score, isPassed })
        });
      } catch (err) { console.error(err); }
      navigate('/result', { state: { results, questions, score, isPassed, sessionId, userId, examType } });
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswers([]);
      setAnswered(false);
      setDetail(null);
    }
  };

  const getChoiceStyle = (choice: string) => {
    const base = {
      padding: "12px 20px",
      marginBottom: 12,
      borderRadius: 2,
      cursor: answered ? "default" : "pointer",
      border: "1px solid",
      display: "flex",
      alignItems: "center",
      width: "100%",
      textAlign: "left" as const,
      fontSize: 14,
      transition: "all 0.1s ease",
    };
    if (!answered) {
      const selected = selectedAnswers.includes(choice);
      return {
        ...base,
        borderColor: selected ? "#0073bb" : "#d1d5db",
        background: selected ? "#f2f8fd" : "white",
        boxShadow: selected ? "inset 0 0 0 1px #0073bb" : "none",
        fontWeight: selected ? 700 : 400,
      };
    }
    const correctAnswers = detail?.correctAnswers || [];
    const isCorrect = correctAnswers.includes(choice);
    const isSelected = selectedAnswers.includes(choice);

    if (isCorrect) {
      return { ...base, borderColor: "#037f0c", background: "#f2fcf3", fontWeight: 700, color: "#037f0c" };
    }
    if (isSelected && !isCorrect) {
      return { ...base, borderColor: "#d13212", background: "#fdf3f1", fontWeight: 700, color: "#d13212" };
    }
    return { ...base, borderColor: "#eaeded", background: "#fbfbfb", color: "#545b64" };
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px", color: "#16191f" }} className="session-container">
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '演習設定', path: '/exercise/setup' }, { label: '演習中' }]} />

      <div style={{ background: "white", border: "1px solid #eaeded", borderRadius: 2, padding: "24px 32px", boxShadow: "0 1px 1px 0 rgba(0,28,36,0.1), 1px 1px 1px 0 rgba(0,28,36,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            問題 {currentIndex + 1}
            <span style={{ fontWeight: 400, fontSize: 14, color: "#545b64", marginLeft: 12 }}>
              全 {questions.length} 問
            </span>
          </h1>
          <span style={{ background: "#f2f3f3", color: "#545b64", padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700, border: "1px solid #d1d5db" }}>
            {currentQuestion.examType}
          </span>
        </div>

        <div style={{ marginBottom: 24 }}>
          {currentQuestion.isMultiple && (
            <div style={{ display: "inline-block", background: "#f2f8fd", color: "#0073bb", padding: "2px 8px", borderRadius: 2, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              複数選択
            </div>
          )}
          <p style={{ fontSize: 16, lineHeight: 1.6, fontWeight: 400, margin: 0, color: "#16191f" }}>
            {currentQuestion.questionText}
          </p>
        </div>

        <div style={{ marginBottom: 32 }}>
          {currentQuestion.choices.map((choice: string) => (
            <button key={choice} onClick={() => toggleAnswer(choice)} style={getChoiceStyle(choice)}>
              <span style={{
                width: 18, height: 18, border: "1px solid #545b64",
                borderRadius: currentQuestion.isMultiple ? 2 : "50%",
                marginRight: 12, display: "flex", alignItems: "center", justifyContent: "center",
                background: selectedAnswers.includes(choice) ? "#0073bb" : "white",
                borderColor: selectedAnswers.includes(choice) ? "#0073bb" : "#545b64",
                flexShrink: 0
              }}>
                {selectedAnswers.includes(choice) && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />}
              </span>
              {choice}
            </button>
          ))}
        </div>

        {answered && detail && (
          <div style={{
            background: results[results.length - 1]?.isCorrect ? "#f2fcf3" : "#fdf3f1",
            borderLeft: `8px solid ${results[results.length - 1]?.isCorrect ? "#037f0c" : "#d13212"}`,
            padding: "16px 20px", marginBottom: 24
          }}>
            <h3 style={{
              margin: "0 0 8px", fontSize: 16,
              color: results[results.length - 1]?.isCorrect ? "#037f0c" : "#d13212",
              display: "flex", alignItems: "center", gap: 8
            }}>
              {results[results.length - 1]?.isCorrect ? "✓ 正解" : "✗ 不正解"}
            </h3>
            <p style={{ margin: "0 0 12px", fontSize: 14 }}>
              <strong>正解：</strong> {detail.correctAnswers?.join(", ")}
            </p>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              <strong>解説：</strong>
              <div style={{ marginTop: 4 }}>{detail.explanation}</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, borderTop: "1px solid #eaeded", paddingTop: 24 }}>
          {!answered ? (
            <button
              onClick={submitAnswer}
              disabled={selectedAnswers.length === 0 || loading}
              style={{
                padding: "8px 20px",
                background: selectedAnswers.length > 0 ? "#ff9900" : "#eaeded",
                color: selectedAnswers.length > 0 ? "#16191f" : "#aab7b8",
                border: "1px solid transparent",
                borderRadius: 2,
                cursor: selectedAnswers.length > 0 ? "pointer" : "not-allowed",
                fontSize: 14,
                fontWeight: 700,
                transition: "background 0.1s"
              }}
              onMouseEnter={e => { if (selectedAnswers.length > 0) e.currentTarget.style.background = "#ec7211"; }}
              onMouseLeave={e => { if (selectedAnswers.length > 0) e.currentTarget.style.background = "#ff9900"; }}
            >
              {loading ? "送信中..." : "回答する"}
            </button>
          ) : (
            <button
              onClick={nextQuestion}
              style={{
                padding: "8px 20px",
                background: "white",
                color: "#0073bb",
                border: "1px solid #0073bb",
                borderRadius: 2,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                transition: "all 0.1s"
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "#f2f8fd";
                e.currentTarget.style.borderColor = "#005a9e";
                e.currentTarget.style.color = "#005a9e";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "white";
                e.currentTarget.style.borderColor = "#0073bb";
                e.currentTarget.style.color = "#0073bb";
              }}
            >
              {currentIndex + 1 >= questions.length ? "結果を表示" : "次の問題へ"}
            </button>
          )}
        </div>
      </div>

      {/* コラム（豆知識） */}
      {tips.length > 0 && (() => {
        const tip = tips[currentIndex % tips.length];
        return (
          <div style={{ marginTop: 32, borderTop: "1px solid #e8e8e8", paddingTop: 20 }}>
            <div style={{ fontSize: 11, color: "#aaa", letterSpacing: 1, marginBottom: 8 }}>📖 COLUMN</div>
            <div style={{ background: "#fffbf0", border: "1px solid #ffe8a0", borderRadius: 8, padding: "14px 18px" }}>
              <p style={{ fontWeight: "bold", color: "#7a5500", margin: "0 0 6px", fontSize: 14 }}>{tip.title}</p>
              <p style={{ color: "#555", margin: 0, fontSize: 13, lineHeight: 1.7 }}>{tip.content}</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
