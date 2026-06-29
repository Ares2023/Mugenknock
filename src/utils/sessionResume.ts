import { API_ENDPOINT } from '../constants';

// サーバ保存された進行中セッション(active-sessions)を localStorage ドラフトへ補完する。
// 別端末・キャッシュ削除で localStorage にドラフトが無くても、サーバ保存分から再開できるようにする。
// localStorage に既にドラフトがある種別は上書きしない（ローカルが最新のため）。
// 戻り値: 1件以上補完したら true（呼び出し側でドラフト状態を再読込する）。
export async function hydrateDraftsFromServer(userId: string): Promise<boolean> {
  if (!userId || userId === 'guest') return false;
  let hydrated = false;
  try {
    const res = await fetch(`${API_ENDPOINT}/users/me/active-sessions?userId=${encodeURIComponent(userId)}`).then(r => r.json());
    const sessions: any[] = res.sessions ?? [];
    for (const s of sessions) {
      const type: string = s.type;
      const key = (type === 'mini' || type === 'exam') ? `examDraft_${userId}`
        : type === 'focused' ? `focusedExerciseDraft_${userId}`
        : type === 'quick' ? `quickExerciseDraft_${userId}`
        : `practiceExerciseDraft_${userId}`;
      if (localStorage.getItem(key)) continue; // ローカル優先
      const ids: string[] = s.questionIds ?? [];
      if (ids.length === 0 || !s.draft) continue;
      // 問題本体を取得し、順序を questionIds に合わせる（ids取得は順不同のため）
      const qData = await fetch(`${API_ENDPOINT}/questions?ids=${ids.join(',')}&withAnswers=true&examType=${s.examType}`).then(r => r.json());
      const byId = new Map((qData.items ?? []).map((q: any) => [q.questionId, q]));
      const questions = ids.map(id => byId.get(id)).filter(Boolean);
      if (questions.length === 0) continue;
      const savedAt = s.draftSavedAt ? Date.parse(s.draftSavedAt) : Date.now();
      let draftObj: any;
      if (type === 'mini' || type === 'exam') {
        draftObj = {
          sessionId: s.sessionId, examType: s.examType, questions, userId, isMini: type === 'mini',
          currentIndex: s.draft.currentIndex ?? 0, answers: s.draft.answers ?? {}, timeLeft: s.draft.timeLeft, savedAt,
        };
      } else {
        draftObj = {
          sessionId: s.sessionId, examType: s.examType, questions, questionIds: ids, userId,
          currentIndex: s.draft.currentIndex ?? 0, results: s.draft.results ?? [],
          answered: s.draft.answered ?? false, selectedAnswers: s.draft.selectedAnswers ?? [],
          isQuick: type === 'quick', isFocused: type === 'focused', isMini: false, savedAt,
        };
      }
      try { localStorage.setItem(key, JSON.stringify(draftObj)); hydrated = true; } catch { /* quota */ }
    }
  } catch { /* ネットワーク等は黙殺（localStorageのみで継続） */ }
  return hydrated;
}
