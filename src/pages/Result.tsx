import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PASS_SCORES, PASS_RATE } from '../constants';

export default function Result() {
  const navigate = useNavigate();
  const location = useLocation();
  const { results, questions, score, isPassed, examType, mode, timeUp } = location.state as any;

  const resolvedExamType = examType ?? questions?.[0]?.examType ?? 'SAA';
  const passScore = PASS_SCORES[resolvedExamType];
  const passRate = PASS_RATE[resolvedExamType];
  const isExam = mode === 'exam';

  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '24px 24px', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#232f3e', marginTop: 0 }}>
        {isExam ? '模試結果' : '演習結果'}
      </h2>

      {/* スコアカード */}
      <div style={{ textAlign: 'center', padding: '28px 24px',
        background: isPassed ? '#eafaf1' : '#fdf2f2', borderRadius: 12, marginBottom: 24 }}>
        {timeUp && <p style={{ color: '#e74c3c', fontSize: 13, margin: '0 0 8px' }}>⏱ 制限時間終了</p>}
        <p style={{ fontSize: 52, fontWeight: 'bold', color: isPassed ? '#27ae60' : '#e74c3c', margin: 0 }}>{score}%</p>
        <p style={{ fontSize: 26, fontWeight: 'bold', color: isPassed ? '#27ae60' : '#e74c3c', margin: '8px 0' }}>
          {isPassed ? '合格' : '不合格'}
        </p>
        <p style={{ color: '#888', fontSize: 13, margin: '4px 0' }}>
          合格ライン: <strong>{passRate}%</strong>
          <span style={{ marginLeft: 8 }}>（公式スコア {passScore} / 1000 相当）</span>
        </p>
        <p style={{ color: '#555', marginTop: 8 }}>
          {results.filter((r: any) => r.isCorrect).length} / {questions.length} 問正解
        </p>
      </div>

      {/* 問題ごとの結果 */}
      <h3 style={{ color: '#232f3e' }}>問題ごとの結果</h3>
      {questions.map((q: any, i: number) => {
        const result = results[i];
        const isCorrect = result?.isCorrect;
        const expanded = expandedId === q.questionId;

        return (
          <div key={q.questionId}
            style={{ border: '1px solid #ddd', borderRadius: 8, marginBottom: 8, overflow: 'hidden',
              borderLeft: `4px solid ${isCorrect ? '#27ae60' : '#e74c3c'}` }}>
            {/* ヘッダー行 */}
            <div onClick={() => setExpandedId(expanded ? null : q.questionId)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                cursor: 'pointer', background: expanded ? '#fafafa' : 'white' }}>
              <span style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>{expanded ? '▼' : '▶'}</span>
              <span style={{ fontSize: 13, color: '#888', flexShrink: 0, minWidth: 36 }}>問{i + 1}</span>
              <span style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {q.questionText}
              </span>
              <span style={{ fontWeight: 'bold', fontSize: 13, flexShrink: 0,
                color: isCorrect ? '#27ae60' : '#e74c3c' }}>
                {isCorrect ? '✓ 正解' : '✗ 不正解'}
              </span>
            </div>

            {/* 展開：選択肢・解説 */}
            {expanded && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', background: '#fafafa', fontSize: 13 }}>
                <div style={{ marginBottom: 12 }}>
                  {q.choices?.map((c: string) => {
                    const correct = q.correctAnswers?.includes(c);
                    return (
                      <div key={c} style={{ padding: '6px 10px', marginBottom: 4, borderRadius: 4,
                        background: correct ? '#eafaf1' : '#f5f5f5',
                        border: `1px solid ${correct ? '#27ae60' : '#e0e0e0'}`,
                        color: correct ? '#27ae60' : '#333' }}>
                        {correct ? '✓ ' : ''}{c}
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <div style={{ background: '#f0f8ff', borderRadius: 4, padding: '10px 12px', color: '#555', lineHeight: 1.7 }}>
                    <strong>解説：</strong>{q.explanation}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button onClick={() => navigate('/')}
          style={{ padding: '12px 24px', background: '#232f3e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 15 }}>
          ホームへ
        </button>
        <button onClick={() => navigate(isExam ? '/exam/setup' : '/exercise/setup')}
          style={{ padding: '12px 24px', background: '#ff9900', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 15 }}>
          もう一度
        </button>
      </div>
    </div>
  );
}
