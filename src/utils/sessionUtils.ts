import { API_ENDPOINT, PASS_RATE } from '../constants';

// 既存のドラフトセッションを採点してDBに記録し、localStorageから削除する
export async function autoScoreAndClearDrafts(userId: string): Promise<void> {
  const draftKeys = [
    `quickExerciseDraft_${userId}`,
    `focusedExerciseDraft_${userId}`,
    `practiceExerciseDraft_${userId}`,
    `examDraft_${userId}`,
  ];

  await Promise.all(draftKeys.map(async (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;

    let draft: any;
    try { draft = JSON.parse(raw); } catch { localStorage.removeItem(key); return; }
    if (!draft?.sessionId || !draft?.userId) { localStorage.removeItem(key); return; }

    let score = 0;
    let hasSomething = false;

    if (Array.isArray(draft.results) && draft.results.length > 0) {
      const correct = draft.results.filter((r: any) => r.isCorrect).length;
      score = Math.round(correct / draft.results.length * 100);
      hasSomething = true;
    } else if (draft.answers && Object.keys(draft.answers).length > 0) {
      const answeredQs = (draft.questions ?? []).filter(
        (q: any) => (draft.answers[q.questionId] ?? []).length > 0
      );
      if (answeredQs.length > 0) {
        const correct = answeredQs.filter((q: any) => {
          const userSet = new Set<string>(draft.answers[q.questionId] ?? []);
          const correctAns: string[] = q.correctAnswers ?? [];
          return correctAns.length === userSet.size && correctAns.every(a => userSet.has(a));
        }).length;
        score = Math.round(correct / answeredQs.length * 100);
        hasSomething = true;
      }
    }

    if (!hasSomething) { localStorage.removeItem(key); return; }

    const basePassRate = PASS_RATE[draft.examType] ?? PASS_RATE['SAA'] ?? 72;
    const passRate = draft.isMini ? Math.ceil(basePassRate / 5) : basePassRate;

    try {
      await fetch(`${API_ENDPOINT}/sessions/${draft.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: draft.userId, status: 'completed', score, isPassed: score >= passRate }),
      });
    } catch { /* silent */ }

    localStorage.removeItem(key);
  }));
}
