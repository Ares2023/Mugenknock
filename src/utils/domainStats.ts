// ドメイン別統計の永続化ヘルパ。
// 正準キーは「examType_index」形式（例: "SAA_0"）。
// localStorage はexamType別キー / UserTagStats も同形式で保存する。
import { API_ENDPOINT, questionDomainIndex, makeTagId, QuestionLike } from '../constants';

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
// 戻り値は index 文字列キーの domain_results（呼び出し側の ustats キャッシュ楽観更新に使う。
// セッションの対象examType分のみ返す＝従来と同じ形）。
//
// 各回答は「回答した問題自身の examType」でグループ化してから記録する。通常セッションは
// 全問が同一examTypeなので挙動は変わらないが、前提知識(companion)混在セッション
// （specs/003-original-exam-blend）では公式資格とオリジナル資格の問題が混在するため、
// セッションの target examType を全問に一律適用すると、companion問題の domain index が
// 別体系にもかかわらず targetExam の tagId で記録されてしまい、(a) targetExam側の
// ドメイン統計を誤って汚染し、(b) companion側(オリジナル資格)の統計には反映されない、
// という二重の不整合が起きる。問題自身の examType でグループ化することで両方解消する。
export function recordSessionDomainStats(opts: {
  examType: string;
  userId: string;
  results: { questionId: string; isCorrect: boolean }[];
  questionById: (questionId: string) => QuestionLike | undefined;
}): Record<string, boolean[]> {
  const { examType, userId, results, questionById } = opts;
  const idxOf = (qId: string) => { const q = questionById(qId); return q ? questionDomainIndex(q) : -1; };

  const groups = new Map<string, { questionId: string; isCorrect: boolean }[]>();
  for (const r of results) {
    const q = questionById(r.questionId);
    const et = q?.examType || examType; // 問題データが引けない場合はセッションexamTypeへフォールバック
    if (!groups.has(et)) groups.set(et, []);
    groups.get(et)!.push(r);
  }

  const resultsDelta: Record<string, boolean[]> = {};
  let primaryDr: Record<string, boolean[]> = {};

  for (const [et, groupResults] of groups) {
    // ドメイン別 delta（index文字列キー）
    const delta: Record<string, { c: number; i: number }> = {};
    for (const r of groupResults) {
      const idx = idxOf(r.questionId);
      if (idx < 0) continue;
      const k = String(idx);
      (delta[k] ??= { c: 0, i: 0 });
      if (r.isCorrect) delta[k].c++; else delta[k].i++;
    }

    // domain_history（直近10セッション、ゲストでも保存）
    try {
      const dh = readDomainHistory(et, userId);
      for (const [k, d] of Object.entries(delta)) {
        if (d.c + d.i === 0) continue;
        dh[k] = [...(dh[k] ?? []), { correct: d.c, total: d.c + d.i }].slice(-10);
      }
      localStorage.setItem(`domain_history_${et}_${userId}`, JSON.stringify(dh));
    } catch {}

    // domain_results（直近30問の個別正誤）+ サーバー同期用 resultsDelta へ集約
    // サーバーへはセッションの新規回答デルタのみ送信。サーバー側で既存データにマージするため
    // ローカルストレージが空の状態でも蓄積データが上書きされない。
    // 最大30問保持し、苦手分析で直近10/20/30問のフィルタ表示に使う（30問以前は破棄）。
    const dr = readDomainResults(et, userId);
    try {
      for (const r of groupResults) {
        const idx = idxOf(r.questionId);
        if (idx < 0) continue;
        const k = String(idx);
        dr[k] = [...(dr[k] ?? []), r.isCorrect].slice(-30);
        // tagId は "examType_index" 形式（例: "SAA_0"）。旧形式("0")は試験間で共有されていたため廃止。
        const tagId = makeTagId(et, idx);
        (resultsDelta[tagId] = resultsDelta[tagId] ?? []).push(r.isCorrect);
      }
      localStorage.setItem(`domain_results_${et}_${userId}`, JSON.stringify(dr));
    } catch {}

    if (et === examType) primaryDr = dr;
  }

  // PUT /users/me/domain-results は tagId をキーとして汎用的にマージするだけで
  // examType 自体は使わないため、複数examType分のtagIdが混在しても1リクエストで送れる。
  if (userId && userId !== 'guest' && Object.keys(resultsDelta).length > 0) {
    fetch(`${API_ENDPOINT}/users/me/domain-results`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, domainResults: resultsDelta }),
    }).catch(() => {});
  }

  return primaryDr;
}
