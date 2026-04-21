import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PASS_SCORE } from '../constants';

export default function Result() {
  const navigate = useNavigate();
  const location = useLocation();
  const { results, questions, score, isPassed } = location.state as any;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ color: "#232f3e" }}>結果</h1>

      <div style={{ textAlign: "center", padding: 32, background: isPassed ? "#eafaf1" : "#fdf2f2", borderRadius: 12, marginBottom: 24 }}>
        <p style={{ fontSize: 48, fontWeight: "bold", color: isPassed ? "#27ae60" : "#e74c3c", margin: 0 }}>{score}%</p>
        <p style={{ fontSize: 24, fontWeight: "bold", color: isPassed ? "#27ae60" : "#e74c3c" }}>
          {isPassed ? "合格" : "不合格"}
        </p>
        <p style={{ color: "#888" }}>合格ライン: {PASS_SCORE}%</p>
        <p>{results.filter((r: any) => r.isCorrect).length} / {questions.length} 問正解</p>
      </div>

      <h2>問題ごとの結果</h2>
      {questions.map((q: any, i: number) => {
        const result = results[i];
        return (
          <div key={q.questionId} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 8, borderLeft: `4px solid ${result?.isCorrect ? "#27ae60" : "#e74c3c"}` }}>
            <span style={{ fontSize: 12, color: "#888" }}>問{i + 1}</span>
            <p style={{ margin: "4px 0", fontWeight: "bold" }}>{q.questionText}</p>
            <span style={{ color: result?.isCorrect ? "#27ae60" : "#e74c3c", fontWeight: "bold" }}>
              {result?.isCorrect ? "✓ 正解" : "✗ 不正解"}
            </span>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
        <button onClick={() => navigate("/")}
          style={{ padding: "12px 24px", background: "#232f3e", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 16 }}>
          ホームへ
        </button>
        <button onClick={() => navigate("/exercise/setup")}
          style={{ padding: "12px 24px", background: "#ff9900", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 16 }}>
          もう一度
        </button>
      </div>
    </div>
  );
}
