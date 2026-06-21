import { API_ENDPOINT, EXAM_DOMAINS, qDomainName } from '../constants';
import { getCachedPersist, setCachedPersist } from './cache';

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  correctAnswerIndices?: number[];
  choiceExplanations?: string[];
  explanation?: string;
  domain?: number;
  isMultiple: boolean;
  correctAnswerCount?: number;
  validityCheckedAt?: string;
};

export interface PrefetchEntry {
  questions: Question[];
  examType: string;
  userId: string;
  prefsSnapshot: string;
  cachedAt: number;
}

type QuickPrefs = {
  questionCount?: number;
  domains?: string[];
  unansweredOnly?: boolean;
  incorrectOnly?: boolean;
  bookmarkOnly?: boolean;
};

type FocusedPrefs = {
  questionCount?: number;
  focusIncorrect?: boolean;
  focusDomain?: string;
};

const KEY_A = (examType: string) => `pfq_A_${examType}`;
const KEY_B = (examType: string, userId: string) => `pfq_B_${examType}_${userId}`;
const KEY_C = (examType: string, userId: string) => `pfq_C_${examType}_${userId}`;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function readDomainHistory(examType: string, userId: string): Record<string, { correct: number; total: number }[]> {
  try { return JSON.parse(localStorage.getItem(`domain_history_${examType}_${userId}`) ?? '{}'); } catch { return {}; }
}

async function fetchPool(examType: string): Promise<Question[]> {
  const qCacheKey = `qlist_${examType}`;
  const cached = getCachedPersist<{ items: Question[]; total: number }>(qCacheKey);
  if (cached) {
    return (cached.items ?? []).filter((q) => !!q.validityCheckedAt);
  }
  const res = await fetch(`${API_ENDPOINT}/questions?examType=${examType}&withAnswers=true`);
  const data = await res.json();
  // 問題リストをキャッシュに保存
  setCachedPersist(qCacheKey, data);
  return (data.items ?? []).filter((q: Question) => !!q.validityCheckedAt);
}

function saveEntry(key: string, entry: PrefetchEntry): void {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage 容量不足の場合は無視
  }
}

// タイプA: フィルタなし（ランダムシャッフル）
export async function prefetchTypeA(examType: string, userId = 'guest'): Promise<void> {
  try {
    const pool = await fetchPool(examType);
    const questions = shuffle(pool).slice(0, 20);
    saveEntry(KEY_A(examType), { questions, examType, userId, prefsSnapshot: '', cachedAt: Date.now() });
  } catch (err) {
    console.debug('[prefetch] A failed:', err);
  }
}

// タイプB: しっかり対策フィルタ適用
export async function prefetchTypeB(examType: string, userId: string, prefs: FocusedPrefs): Promise<void> {
  try {
    const [pool, incorrectRes] = await Promise.all([
      fetchPool(examType),
      fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${examType}`).then(r => r.json()),
    ]);

    const incorrectIds = new Set<string>(incorrectRes.questionIds ?? []);
    const focusIncorrect = prefs.focusIncorrect !== false;
    const focusDomain = prefs.focusDomain ?? 'below60';

    let items: Question[] = [];
    if (focusIncorrect) {
      items = pool.filter(q => incorrectIds.has(q.questionId));
    }
    if (focusDomain !== 'none') {
      const threshold = focusDomain === 'below40' ? 0.40 : focusDomain === 'below50' ? 0.50 : focusDomain === 'below70' ? 0.70 : 0.60;
      const examDomains = EXAM_DOMAINS[examType] ?? [];
      const hist = readDomainHistory(examType, userId);
      const weakDomains = new Set<string>(
        examDomains.filter(domain => {
          const sessions = hist[domain];
          if (!sessions || sessions.length === 0) return true;
          const correct = sessions.reduce((s, r) => s + r.correct, 0);
          const total = sessions.reduce((s, r) => s + r.total, 0);
          return total === 0 || correct / total < threshold;
        })
      );
      const seenIds = new Set(items.map(q => q.questionId));
      items = [...items, ...pool.filter(q => weakDomains.has(qDomainName(q)) && !seenIds.has(q.questionId))];
    }
    if (items.length === 0 && !focusIncorrect && focusDomain === 'none') {
      items = [...pool];
    }
    items = shuffle(items);
    if (items.length < 30) {
      const seenIds = new Set(items.map(q => q.questionId));
      items = [...items, ...shuffle(pool.filter(q => !seenIds.has(q.questionId)))];
    }
    items = Array.from(new Map(items.map(q => [q.questionId, q])).values()).slice(0, 30);

    const snap = JSON.stringify({ focusIncorrect: prefs.focusIncorrect, focusDomain: prefs.focusDomain });
    saveEntry(KEY_B(examType, userId), { questions: items, examType, userId, prefsSnapshot: snap, cachedAt: Date.now() });
  } catch (err) {
    console.debug('[prefetch] B failed:', err);
  }
}

// タイプC: サクッと演習フィルタ適用
export async function prefetchTypeC(examType: string, userId: string, prefs: QuickPrefs): Promise<void> {
  try {
    const needUserData = userId !== 'guest' && !!(prefs.unansweredOnly || prefs.incorrectOnly || prefs.bookmarkOnly);
    const [pool, answeredRes, incorrectRes, bkmRes] = await Promise.all([
      fetchPool(examType),
      needUserData && prefs.unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
      needUserData && prefs.incorrectOnly  ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
      needUserData && prefs.bookmarkOnly   ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
    ]);

    let items = [...pool];
    if (needUserData) {
      const unansweredSet = prefs.unansweredOnly && answeredRes ? new Set<string>(answeredRes.questionIds ?? []) : null;
      const incorrectSet  = prefs.incorrectOnly  && incorrectRes ? new Set<string>(incorrectRes.questionIds ?? []) : null;
      const bookmarkSet   = prefs.bookmarkOnly   && bkmRes       ? new Set<string>(bkmRes.questionIds ?? [])      : null;
      items.sort((a, b) => {
        const score = (q: Question) =>
          (unansweredSet && !unansweredSet.has(q.questionId) ? 1 : 0) +
          (incorrectSet  && incorrectSet.has(q.questionId)   ? 1 : 0) +
          (bookmarkSet   && bookmarkSet.has(q.questionId)    ? 1 : 0);
        return score(b) - score(a);
      });
    }
    const selDomains: string[] = prefs.domains ?? [];
    if (selDomains.length > 0) {
      items = items.filter(q => selDomains.includes(qDomainName(q)));
    }
    items = shuffle(items);
    if (items.length < 20) {
      const seenIds = new Set(items.map(q => q.questionId));
      items = [...items, ...shuffle(pool.filter(q => !seenIds.has(q.questionId)))];
    }
    items = Array.from(new Map(items.map(q => [q.questionId, q])).values()).slice(0, 20);

    const snap = JSON.stringify({ unansweredOnly: prefs.unansweredOnly, incorrectOnly: prefs.incorrectOnly, bookmarkOnly: prefs.bookmarkOnly, domains: prefs.domains });
    saveEntry(KEY_C(examType, userId), { questions: items, examType, userId, prefsSnapshot: snap, cachedAt: Date.now() });
  } catch (err) {
    console.debug('[prefetch] C failed:', err);
  }
}

// ── キャッシュ読み出し ──────────────────────────────────────────

export function getPrefetchA(examType: string): PrefetchEntry | null {
  try {
    const raw = localStorage.getItem(KEY_A(examType));
    if (!raw) return null;
    const entry: PrefetchEntry = JSON.parse(raw);
    if (entry.examType !== examType) return null;
    return entry;
  } catch { return null; }
}

export function getPrefetchB(examType: string, userId: string, prefs: FocusedPrefs): PrefetchEntry | null {
  try {
    const raw = localStorage.getItem(KEY_B(examType, userId));
    if (!raw) return null;
    const entry: PrefetchEntry = JSON.parse(raw);
    if (entry.examType !== examType || entry.userId !== userId) return null;
    const snap = JSON.stringify({ focusIncorrect: prefs.focusIncorrect, focusDomain: prefs.focusDomain });
    if (entry.prefsSnapshot !== snap) return null;
    return entry;
  } catch { return null; }
}

export function getPrefetchC(examType: string, userId: string, prefs: QuickPrefs): PrefetchEntry | null {
  try {
    const raw = localStorage.getItem(KEY_C(examType, userId));
    if (!raw) return null;
    const entry: PrefetchEntry = JSON.parse(raw);
    if (entry.examType !== examType || entry.userId !== userId) return null;
    const snap = JSON.stringify({ unansweredOnly: prefs.unansweredOnly, incorrectOnly: prefs.incorrectOnly, bookmarkOnly: prefs.bookmarkOnly, domains: prefs.domains });
    if (entry.prefsSnapshot !== snap) return null;
    return entry;
  } catch { return null; }
}

// ── セッション終了後のプリフェッチトリガー（ExerciseSession から呼ぶ） ──

export function schedulePrefetchAfterSession(params: {
  examType: string;
  userId: string;
  isQuick: boolean;
  isFocused: boolean;
}): void {
  const { examType, userId, isQuick, isFocused } = params;
  // ナビゲーションをブロックしないよう非同期で実行
  setTimeout(() => {
    try {
      if (isFocused) {
        const fPrefs: FocusedPrefs = JSON.parse(localStorage.getItem(`focusedExercisePrefs_${userId}`) ?? '{}');
        const hasFilters = fPrefs.focusIncorrect !== false || (fPrefs.focusDomain ?? 'below60') !== 'none';
        if (hasFilters) {
          prefetchTypeB(examType, userId, fPrefs);
        } else {
          prefetchTypeA(examType, userId);
        }
      } else if (isQuick) {
        const qPrefs: QuickPrefs = JSON.parse(localStorage.getItem(`quickExercisePrefs_${userId}`) ?? '{}');
        const hasFilters = !!(qPrefs.unansweredOnly || qPrefs.incorrectOnly || qPrefs.bookmarkOnly || (qPrefs.domains?.length ?? 0) > 0);
        if (hasFilters) {
          prefetchTypeC(examType, userId, qPrefs);
        } else {
          prefetchTypeA(examType, userId);
        }
      } else {
        prefetchTypeA(examType, userId);
      }
    } catch (err) {
      console.debug('[prefetch] schedulePrefetchAfterSession failed:', err);
    }
  }, 200);
}
