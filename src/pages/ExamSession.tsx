import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, EXAM_CONFIGS, PASS_RATE } from '../constants';
import Breadcrumb from '../components/Breadcrumb';

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  explanation?: string;
  isMultiple: boolean;
  tags: string[];
};

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function ExamSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId, questions, userId, examType } = location.state as any;

  const config = EXAM_CONFIGS[examType];
  const totalSec = config.timeLimitMin * 60;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [timeLeft, setTimeLeft] = useState(totalSec);
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const finishedRef = useRef(false);

  // タイマー
  useEffect(() => {
    if (paused || timeLeft <= 0 || finishedRef.current) return;
    const id = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [paused, timeLeft]);

  // 時間切れ
  useEffect(() => {
    if (timeLeft <= 0 && !finishedRef.current) handleFinish(true);
  }, [timeLeft]);

  const currentQ = questions[currentIndex];
  const selected = answers[currentQ?.questionId] ?? [];

  const toggle = (choice: string) => {
    const qid = currentQ.questionId;
    const cur = answers[qid] ?? [];
    if (currentQ.isMultiple) {
      setAnswers(prev => ({
        ...prev,
        [qid]: cur.includes(choice) ? cur.filter(c => c !== choice) : [...cur, choice]
      }));
    } else {
      setAnswers(prev => ({ ...prev, [qid]: [choice] }));
    }
  };

  const handleFinish = async (timeUp = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    setPaused(false);

    try {
      // 全問の正解・解説を取得
      const details = await Promise.all(
        questions.map((q: Question) =>
          fetch(`${API_ENDPOINT}/questions/${q.questionId}`).then(r => r.json())
        )
      );

      const results: { questionId: string; isCorrect: boolean }[] = [];
      const fullQuestions: Question[] = [];

      for (let i = 0; i < questions.length; i++) {
        const detail: Question = details[i];
        const userAns = answers[detail.questionId] ?? [];
        const correct = detail.correctAnswers ?? [];
        const isCorrect = correct.length === userAns.length && correct.every(a => userAns.includes(a));
        results.push({ questionId: detail.questionId, isCorrect });
        fullQuestions.push({ ...questions[i], ...detail });

        // 回答を記録
        try {
          await fetch(`${API_ENDPOINT}/sessions/${sessionId}/answers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, questionId: detail.questionId, selectedAnswers: userAns, isCorrect, tags: detail.tags ?? [] })
          });
        } catch { /* ignore individual errors */ }
      }

      const correctCount = results.filter(r => r.isCorrect).length;
      const score = Math.round((correctCount / questions.length) * 100);
      const isPassed = score >= PASS_RATE[examType];

      await fetch(`${API_ENDPOINT}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'completed', score, isPassed })
      });

      navigate('/result', {
        state: { results, questions: fullQuestions, score, isPassed, sessionId, userId, examType, mode: 'exam', timeUp }
      });
    } catch (err) {
      console.error(err);
      alert('提出に失敗しました');
      finishedRef.current = false;
      setSubmitting(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;
  const timerRed = timeLeft < 300; // 5分以下で赤

  const navBg = (i: number) => {
    if (i === currentIndex) return '#0073bb';
    if (answers[questions[i]?.questionId]) return '#2980b9';
    return '#e8e8e8';
  };

  if (submitting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ fontSize: 18, color: '#555' }}>採点中...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 40px', color: '#16191f' }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '模試設定', path: '/exam/setup' }, { label: '模試中' }]} />

      {/* 一時停止オーバーレイ */}
      {paused && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,28,36,0.7)', zIndex: 100,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <div style={{ fontSize: 28, color: 'white', fontWeight: 700 }}>⏸ 一時停止中</div>
          <div style={{ fontSize: 14, color: '#d5dbdb' }}>問題は隠されています</div>
          <button onClick={() => setPaused(false)}
            style={{
              padding: '12px 32px',
              background: 'white',
              color: '#0073bb',
              border: '2px solid #0073bb',
              borderRadius: 2,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.1s'
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
            ▶ 再開する
          </button>
        </div>
      )}

      {/* 確認ダイアログ */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 2, padding: 32, maxWidth: 420, width: '90%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>提出の確認</div>
            <div style={{ fontSize: 15, color: '#545b64', marginBottom: 24, lineHeight: 1.6 }}>
              回答済み: <strong>{answeredCount}</strong> / {questions.length} 問<br />
              未回答: <strong style={{ color: unansweredCount > 0 ? '#d13212' : '#037f0c' }}>{unansweredCount}</strong> 問<br /><br />
              全ての回答を提出して採点しますか？
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ padding: '8px 20px', border: '1px solid #545b64', borderRadius: 2, cursor: 'pointer', background: 'white', fontWeight: 700 }}>
                キャンセル
              </button>
              <button onClick={() => { setShowConfirm(false); handleFinish(); }}
                style={{ padding: '8px 20px', background: '#ff9900', color: '#16191f', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', fontWeight: 700 }}>
                提出する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* タイマーバー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'white', borderRadius: 2, padding: '12px 24px', marginBottom: 20,
        border: '1px solid #eaeded', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#545b64', background: '#f2f3f3', padding: '2px 8px', borderRadius: 12, border: '1px solid #d1d5db' }}>{examType} 模試</span>
          <span style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace',
            color: timerRed ? '#d13212' : '#16191f', transition: 'color 1s' }}>
            {formatTime(timeLeft)}
          </span>
          {timerRed && <span style={{ fontSize: 12, color: '#d13212', fontWeight: 700 }}>⚠️ 残り時間わずか</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: '#545b64' }}>問題 {currentIndex + 1} / {questions.length}</span>
          <button onClick={() => setPaused(true)}
            style={{ padding: '6px 16px', border: '1px solid #545b64', borderRadius: 2,
              cursor: 'pointer', background: 'white', fontSize: 13, fontWeight: 700 }}>
            ⏸ 一時停止
          </button>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #eaeded", borderRadius: 2, padding: "24px 32px", boxShadow: "0 1px 1px 0 rgba(0,28,36,0.1), 1px 1px 1px 0 rgba(0,28,36,0.15)", marginBottom: 24 }}>
        {/* 問題 */}
        <div style={{ marginBottom: 24 }}>
          {currentQ.isMultiple && (
            <div style={{ display: "inline-block", background: "#f2f8fd", color: "#0073bb", padding: "2px 8px", borderRadius: 2, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              複数選択
            </div>
          )}
          <p style={{ fontSize: 16, lineHeight: 1.6, fontWeight: 400, margin: 0, color: "#16191f" }}>
            {currentQ.questionText}
          </p>
        </div>

        <div style={{ marginBottom: 32 }}>
          {currentQ.choices.map((choice: string) => {
            const isSelected = selected.includes(choice);
            return (
              <button key={choice} onClick={() => toggle(choice)}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                  padding: '12px 20px', marginBottom: 12, borderRadius: 2,
                  border: `1px solid ${isSelected ? '#0073bb' : '#d1d5db'}`,
                  background: isSelected ? '#f2f8fd' : 'white',
                  boxShadow: isSelected ? "inset 0 0 0 1px #0073bb" : "none",
                  cursor: 'pointer', fontSize: 14, fontWeight: isSelected ? 700 : 400,
                  transition: 'all 0.1s'
                }}>
                <span style={{
                  width: 18, height: 18, border: "1px solid #545b64",
                  borderRadius: currentQ.isMultiple ? 2 : "50%",
                  marginRight: 12, display: "flex", alignItems: "center", justifyContent: "center",
                  background: isSelected ? "#0073bb" : "white",
                  borderColor: isSelected ? "#0073bb" : "#545b64",
                  flexShrink: 0
                }}>
                  {isSelected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />}
                </span>
                {choice}
              </button>
            );
          })}
        </div>
      </div>

      {/* ナビゲーションパネル */}
      <div style={{ background: 'white', borderRadius: 2, padding: '20px 24px',
        border: '1px solid #eaeded', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
        <div style={{ fontSize: 12, color: '#545b64', marginBottom: 16, display: 'flex', gap: 20, fontWeight: 700 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: '#0073bb', borderRadius: 2 }} />現在
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: '#2980b9', borderRadius: 2 }} />回答済み
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: '#f2f3f3', borderRadius: 2, border: '1px solid #d1d5db' }} />未回答
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {questions.map((_: any, i: number) => {
            const isCurrent = i === currentIndex;
            const isAnswered = !!answers[questions[i]?.questionId];
            let bg = '#f2f3f3';
            let color = '#545b64';
            let border = '1px solid #d1d5db';
            
            if (isCurrent) {
              bg = '#0073bb';
              color = 'white';
              border = '1px solid #0073bb';
            } else if (isAnswered) {
              bg = '#2980b9';
              color = 'white';
              border = '1px solid #2980b9';
            }

            return (
              <button key={i} onClick={() => setCurrentIndex(i)}
                style={{ width: 36, height: 36, borderRadius: 2, border,
                  background: bg, color,
                  cursor: 'pointer', fontSize: 13, fontWeight: isCurrent ? 700 : 400 }}>
                {i + 1}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eaeded', paddingTop: 20 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
              style={{ padding: '8px 20px', border: '1px solid #545b64', borderRadius: 2, cursor: currentIndex === 0 ? 'default' : 'pointer',
                background: 'white', color: currentIndex === 0 ? '#aab7b8' : '#16191f', fontWeight: 700, borderColor: currentIndex === 0 ? '#eaeded' : '#545b64' }}>
              ← 前の質問
            </button>
            <button onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))} disabled={currentIndex === questions.length - 1}
              style={{ padding: '8px 20px', border: '1px solid #545b64', borderRadius: 2,
                cursor: currentIndex === questions.length - 1 ? 'default' : 'pointer',
                background: 'white', color: currentIndex === questions.length - 1 ? '#aab7b8' : '#16191f', fontWeight: 700, borderColor: currentIndex === questions.length - 1 ? '#eaeded' : '#545b64' }}>
              次の質問 →
            </button>
          </div>
          <button onClick={() => setShowConfirm(true)}
            style={{ padding: '8px 24px', background: '#ff9900', color: '#16191f', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.background = '#ec7211'}
            onMouseLeave={e => e.currentTarget.style.background = '#ff9900'}
          >
            提出する
          </button>
        </div>
      </div>
    </div>
  );
}
