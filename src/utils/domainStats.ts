// ドメイン別統計の永続化ヘルパ。
// 正準キーは「ドメインの整数 index」。localStorage / UserTagStats / domain-results すべて
// index 文字列キーで保存する。旧データ（ドメイン名キー）は読み取り時に index へ正規化する。
import { API_ENDPOINT, questionDomainIndex, QuestionLike } from '../constants';

type Sess = { correct: number; total: number };

// localStorage はすべて index 文字列キーで保存される。
export function readDomainHistory(_examType: string, userId: string): Record<string, Sess[]> {
  try { return JSON.parse(localStorage.getItem(`domain_history_${_examType}_${userId}`) ?? '{}'); }
  catch { return {}; }
}

export function readDomainResults(_examType: string, userId: string): Record<string, boolean[]> {
  try { return JSON.parse(localStorage.getItem(`domain_results_${_examType}_${userId}`) ?? '{}'); }
  catch { return {}; }
}

// index 文字列キーの tagId に対応する recentResults を dr から引く
export function recentForTag(dr: Record<string, boolean[]>, tagId: string): boolean[] | undefined {
  return dr[tagId];
}

// セッション完了時のドメイン別統計を記録する（domain_history / domain_results / サーバー同期）。
// 戻り値は index 文字列キーの domain_results（呼び出し側の ustats キャッシュ楽観更新に使う）。
export function recordSessionDomainStats(opts: {
  examType: string;
  userId: string;
  results: { questionId: string; isCorrect: boolean }[];
  questionById: (questionId: string) => QuestionLike | undefined;
}): Record<string, boolean[]> {
  const { examType, userId, results, questionById } = opts;
  const idxOf = (qId: string) => { const q = questionById(qId); return q ? questionDomainIndex(q) : -1; };

  // ドメイン別 delta（index文字列キー）
  const delta: Record<string, { c: number; i: number }> = {};
  for (const r of results) {
    const idx = idxOf(r.questionId);
    if (idx < 0) continue;
    const k = String(idx);
    (delta[k] ??= { c: 0, i: 0 });
    if (r.isCorrect) delta[k].c++; else delta[k].i++;
  }

  // domain_history（直近10セッション、ゲストでも保存）
  try {
    const dh = readDomainHistory(examType, userId);
    for (const [k, d] of Object.entries(delta)) {
      if (d.c + d.i === 0) continue;
      dh[k] = [...(dh[k] ?? []), { correct: d.c, total: d.c + d.i }].slice(-10);
    }
    localStorage.setItem(`domain_history_${examType}_${userId}`, JSON.stringify(dh));
  } catch {}

  // domain_results（直近10問の個別正誤）+ サーバー同期
  const dr = readDomainResults(examType, userId);
  try {
    for (const r of results) {
      const idx = idxOf(r.questionId);
      if (idx < 0) continue;
      const k = String(idx);
      dr[k] = [...(dr[k] ?? []), r.isCorrect].slice(-10);
    }
    localStorage.setItem(`domain_results_${examType}_${userId}`, JSON.stringify(dr));
    if (userId && userId !== 'guest') {
      fetch(`${API_ENDPOINT}/users/me/domain-results`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, domainResults: dr }),
      }).catch(() => {});
    }
  } catch {}

  return dr;
}
