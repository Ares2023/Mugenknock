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
    const base = { padding: "12px 16px", marginBottom: 8, borderRadius: 8, cursor: answered ? "default" : "pointer", border: "2px solid", display: "block", width: "100%", textAlign: "left" as const, fontSize: 15 };
    if (!answered) {
      return { ...base, borderColor: selectedAnswers.includes(choice) ? "#0073bb" : "#ddd", background: selectedAnswers.includes(choice) ? "#f0f7ff" : "white" };
    }
    const correctAnswers = detail?.correctAnswers || [];
    if (correctAnswers.includes(choice)) return { ...base, borderColor: "#27ae60", background: "#eafaf1" };
    if (selectedAnswers.includes(choice) && !correctAnswers.includes(choice)) return { ...base, borderColor: "#e74c3c", background: "#fdf2f2" };
    return { ...base, borderColor: "#ddd", background: "white" };
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '演習設定', path: '/exercise/setup' }, { label: '演習中' }]} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: "#888" }}>{currentIndex + 1} / {questions.length} 問</span>
        <span style={{ background: "#0073bb", color: "white", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>{currentQuestion.examType}</span>
      </div>

      <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        {currentQuestion.isMultiple && <p style={{ color: "#5a9fd4", fontSize: 13, marginBottom: 8 }}>※複数選択</p>}
        <p style={{ fontSize: 17, fontWeight: "bold", margin: 0 }}>{currentQuestion.questionText}</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        {currentQuestion.choices.map((choice: string) => (
          <button key={choice} onClick={() => toggleAnswer(choice)} style={getChoiceStyle(choice)}>
            {choice}
          </button>
        ))}
      </div>

      {answered && detail && (
        <div style={{ background: "#f0f8ff", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <p style={{ fontWeight: "bold", color: results[results.length - 1]?.isCorrect ? "#27ae60" : "#e74c3c" }}>
            {results[results.length - 1]?.isCorrect ? "✓ 正解！" : "✗ 不正解"}
          </p>
          <p><strong>正解：</strong>{detail.correctAnswers?.join(", ")}</p>
          <p><strong>解説：</strong>{detail.explanation}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 16 }}>
        {!answered && (
          <button onClick={submitAnswer} disabled={selectedAnswers.length === 0 || loading}
            style={{ padding: "12px 32px", background: selectedAnswers.length > 0 ? "#232f3e" : "#ccc", color: "white", border: "none", borderRadius: 4, cursor: selectedAnswers.length > 0 ? "pointer" : "default", fontSize: 16 }}>
            {loading ? "送信中..." : "回答する"}
          </button>
        )}
        {answered && (
          <button onClick={nextQuestion}
            style={{ padding: "12px 32px", background: "#0073bb", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 16 }}>
            {currentIndex + 1 >= questions.length ? "結果を見る" : "次の問題"}
          </button>
        )}
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
