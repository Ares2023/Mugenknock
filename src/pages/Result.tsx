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
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px', color: '#16191f' }} className="result-container">
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>
        {isExam ? '模試結果' : '演習結果'}
      </h2>

      {/* スコアカード */}
      <div style={{ textAlign: 'center', padding: '32px 24px',
        background: isPassed ? '#f2fcf3' : '#fdf3f1', border: `1px solid ${isPassed ? '#037f0c' : '#d13212'}`, borderRadius: 2, marginBottom: 32, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
        {timeUp && <p style={{ color: '#d13212', fontSize: 13, margin: '0 0 12px', fontWeight: 700 }}>⏱ 制限時間終了</p>}
        <p style={{ fontSize: 56, fontWeight: 700, color: isPassed ? '#037f0c' : '#d13212', margin: 0 }}>{score}%</p>
        <p style={{ fontSize: 24, fontWeight: 700, color: isPassed ? '#037f0c' : '#d13212', margin: '8px 0' }}>
          {isPassed ? '合格' : '不合格'}
        </p>
        <p style={{ color: '#545b64', fontSize: 14, margin: '8px 0 4px' }}>
          合格ライン: <strong>{passRate}%</strong>
          <span style={{ marginLeft: 12 }}>（公式スコア {passScore} / 1000 相当）</span>
        </p>
        <p style={{ color: '#16191f', marginTop: 12, fontSize: 16, fontWeight: 700 }}>
          {results.filter((r: any) => r.isCorrect).length} / {questions.length} 問正解
        </p>
      </div>

      {/* 問題ごとの結果 */}
      <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>問題ごとの結果</h3>
      {questions.map((q: any, i: number) => {
        const result = results[i];
        const isCorrect = result?.isCorrect;
        const expanded = expandedId === q.questionId;

        return (
          <div key={q.questionId}
            style={{ border: '1px solid #eaeded', borderRadius: 2, marginBottom: 8, overflow: 'hidden',
              borderLeft: `8px solid ${isCorrect ? '#037f0c' : '#d13212'}` }}>
            {/* ヘッダー行 */}
            <div onClick={() => setExpandedId(expanded ? null : q.questionId)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                cursor: 'pointer', background: expanded ? '#fbfbfb' : 'white' }}>
              <span style={{ fontSize: 12, color: '#545b64', flexShrink: 0 }}>{expanded ? '▼' : '▶'}</span>
              <span style={{ fontSize: 14, color: '#545b64', flexShrink: 0, minWidth: 40, fontWeight: 700 }}>問 {i + 1}</span>
              <span style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {q.questionText}
              </span>
              <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0,
                color: isCorrect ? '#037f0c' : '#d13212' }}>
                {isCorrect ? '✓ 正解' : '✗ 不正解'}
              </span>
            </div>

            {/* 展開：選択肢・解説 */}
            {expanded && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid #eaeded', background: '#fbfbfb', fontSize: 14 }}>
                <div style={{ marginBottom: 16 }}>
                  {q.choices?.map((c: string) => {
                    const correct = q.correctAnswers?.includes(c);
                    return (
                      <div key={c} style={{ padding: '8px 12px', marginBottom: 6, borderRadius: 2,
                        background: correct ? '#f2fcf3' : '#ffffff',
                        border: `1px solid ${correct ? '#037f0c' : '#eaeded'}`,
                        color: correct ? '#037f0c' : '#16191f',
                        fontWeight: correct ? 700 : 400 }}>
                        {correct ? '✓ ' : ''}{c}
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <div style={{ background: '#e0f2f2', borderLeft: '4px solid #008c8c', borderRadius: 2, padding: '12px 16px', color: '#16191f', lineHeight: 1.6 }}>
                    <strong>解説：</strong>
                    <div style={{ marginTop: 4 }}>{q.explanation}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 16, marginTop: 32 }}>
        <button onClick={() => navigate('/')}
          style={{
            padding: '8px 24px',
            background: 'white',
            color: '#008c8c',
            border: '2px solid #008c8c',
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            transition: 'all 0.1s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#e0f2f2";
            e.currentTarget.style.borderColor = "#006666";
            e.currentTarget.style.color = "#006666";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "white";
            e.currentTarget.style.borderColor = "#008c8c";
            e.currentTarget.style.color = "#008c8c";
          }}
        >
          ホームへ戻る
        </button>
        <button onClick={() => navigate(isExam ? '/exam/setup' : '/exercise/setup')}
          style={{
            padding: '8px 24px',
            background: '#ff9900',
            color: '#16191f',
            border: '1px solid transparent',
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#ec7211'}
          onMouseLeave={e => e.currentTarget.style.background = '#ff9900'}
        >
          もう一度挑戦する
        </button>
      </div>
    </div>
  );
}
