// 未ログイン（ゲスト）ユーザーのローカル学習記録。
// answered / incorrect は examType 別、bookmark は全体で保持（サーバAPIの粒度に合わせる）。
// ログイン中はサーバ側が正となるため、これらのローカル記録は使用しない。
// ログイン時にはこれらを読み出してアカウントへ移行する（案3）。

const answeredKey = (examType: string) => `guest_answered_${examType}`;
const incorrectKey = (examType: string) => `guest_incorrect_${examType}`;
const BOOKMARK_KEY = 'guest_bookmarks';

function readSet(key: string): Set<string> {
  try {
    const a = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set<string>(Array.isArray(a) ? a : []);
  } catch { return new Set<string>(); }
}

function writeSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch {}
}

export function getGuestAnsweredIds(examType: string): Set<string> { return readSet(answeredKey(examType)); }
export function getGuestIncorrectIds(examType: string): Set<string> { return readSet(incorrectKey(examType)); }
export function getGuestBookmarkIds(): Set<string> { return readSet(BOOKMARK_KEY); }

/** Focused モード解放判定などに使う、その資格でゲストが解答した問題数 */
export function getGuestAnsweredCount(examType: string): number { return getGuestAnsweredIds(examType).size; }

/** セッション完了時にゲストの解答結果をローカルに反映する（未回答/誤答フィルタ用） */
export function recordGuestAnswers(examType: string, results: { questionId: string; isCorrect: boolean }[]) {
  if (!results || results.length === 0) return;
  const answered = readSet(answeredKey(examType));
  const incorrect = readSet(incorrectKey(examType));
  for (const r of results) {
    if (!r?.questionId) continue;
    answered.add(r.questionId);
    if (r.isCorrect) incorrect.delete(r.questionId); // 正解したら誤答リストから外す
    else incorrect.add(r.questionId);
  }
  writeSet(answeredKey(examType), answered);
  writeSet(incorrectKey(examType), incorrect);
}

export function isGuestBookmarked(qid: string): boolean { return getGuestBookmarkIds().has(qid); }

/** ゲストのブックマークを切り替え、切替後の状態(true=追加)を返す */
export function toggleGuestBookmark(qid: string): boolean {
  const s = getGuestBookmarkIds();
  let now: boolean;
  if (s.has(qid)) { s.delete(qid); now = false; } else { s.add(qid); now = true; }
  writeSet(BOOKMARK_KEY, s);
  return now;
}

/** 案3: ログイン時にアカウントへ移行するためローカル記録をまとめて読み出す */
export function readAllGuestProgress(examTypes: string[]) {
  const answered: Record<string, string[]> = {};
  const incorrect: Record<string, string[]> = {};
  for (const et of examTypes) {
    const a = getGuestAnsweredIds(et); if (a.size) answered[et] = [...a];
    const i = getGuestIncorrectIds(et); if (i.size) incorrect[et] = [...i];
  }
  return { answered, incorrect, bookmarks: [...getGuestBookmarkIds()] };
}
