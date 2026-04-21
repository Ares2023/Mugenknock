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
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px', fontFamily: 'sans-serif', position: 'relative' }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '模試設定', path: '/exam/setup' }, { label: '模試中' }]} />

      {/* 一時停止オーバーレイ */}
      {paused && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <div style={{ fontSize: 28, color: 'white', fontWeight: 'bold' }}>⏸ 一時停止中</div>
          <div style={{ fontSize: 14, color: '#ccc' }}>問題は隠されています</div>
          <button onClick={() => setPaused(false)}
            style={{ padding: '14px 40px', background: '#0073bb', border: 'none', borderRadius: 8, fontSize: 18, fontWeight: 'bold', cursor: 'pointer' }}>
            ▶ 再開する
          </button>
        </div>
      )}

      {/* 確認ダイアログ */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, maxWidth: 360, width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>提出しますか？</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 24 }}>
              回答済み <strong>{answeredCount}</strong> 問 / 未回答 <strong style={{ color: unansweredCount > 0 ? '#e74c3c' : '#27ae60' }}>{unansweredCount}</strong> 問
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ padding: '10px 24px', border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer', background: 'white' }}>
                戻る
              </button>
              <button onClick={() => { setShowConfirm(false); handleFinish(); }}
                style={{ padding: '10px 24px', background: '#232f3e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                提出する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* タイマーバー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'white', borderRadius: 8, padding: '10px 16px', marginBottom: 16,
        border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#888' }}>{examType} 模試</span>
          <span style={{ fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace',
            color: timerRed ? '#e74c3c' : '#232f3e', transition: 'color 1s' }}>
            {formatTime(timeLeft)}
          </span>
          {timerRed && <span style={{ fontSize: 11, color: '#e74c3c' }}>残り時間わずか</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#888' }}>{currentIndex + 1} / {questions.length}</span>
          <button onClick={() => setPaused(true)}
            style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: 4,
              cursor: 'pointer', background: 'white', fontSize: 13 }}>
            ⏸ 一時停止
          </button>
        </div>
      </div>

      {/* 問題 */}
      <div style={{ background: 'white', borderRadius: 8, padding: 20, marginBottom: 16,
        border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        {currentQ.isMultiple && (
          <p style={{ color: '#2980b9', fontSize: 12, margin: '0 0 8px' }}>※ 複数選択</p>
        )}
        <p style={{ fontSize: 16, fontWeight: 'bold', margin: 0, lineHeight: 1.6 }}>{currentQ.questionText}</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        {currentQ.choices.map((choice: string) => {
          const isSelected = selected.includes(choice);
          return (
            <button key={choice} onClick={() => toggle(choice)}
              style={{ display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 16px', marginBottom: 8, borderRadius: 8,
                border: `2px solid ${isSelected ? '#0073bb' : '#ddd'}`,
                background: isSelected ? '#f0f7ff' : 'white', cursor: 'pointer', fontSize: 14 }}>
              {choice}
            </button>
          );
        })}
      </div>

      {/* ナビゲーションパネル */}
      <div style={{ background: 'white', borderRadius: 8, padding: '14px 16px',
        border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10, display: 'flex', gap: 16 }}>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#0073bb', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />現在</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#2980b9', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />回答済み</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#e8e8e8', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />未回答</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {questions.map((_: any, i: number) => (
            <button key={i} onClick={() => setCurrentIndex(i)}
              style={{ width: 34, height: 34, borderRadius: 4, border: 'none',
                background: navBg(i), color: i === currentIndex || answers[questions[i]?.questionId] ? 'white' : '#555',
                cursor: 'pointer', fontSize: 12, fontWeight: i === currentIndex ? 'bold' : 'normal' }}>
              {i + 1}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
              style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 4, cursor: currentIndex === 0 ? 'default' : 'pointer',
                background: currentIndex === 0 ? '#f5f5f5' : 'white', color: currentIndex === 0 ? '#bbb' : '#333' }}>
              ← 前へ
            </button>
            <button onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))} disabled={currentIndex === questions.length - 1}
              style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 4,
                cursor: currentIndex === questions.length - 1 ? 'default' : 'pointer',
                background: currentIndex === questions.length - 1 ? '#f5f5f5' : 'white',
                color: currentIndex === questions.length - 1 ? '#bbb' : '#333' }}>
              次へ →
            </button>
          </div>
          <button onClick={() => setShowConfirm(true)}
            style={{ padding: '10px 24px', background: '#232f3e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 15 }}>
            提出する
          </button>
        </div>
      </div>
    </div>
  );
}
