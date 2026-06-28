// 問題プリフェッチは「全件＋解説の取得（withAnswers）」を行うため、問題数の増加に伴い
// ペイロードが肥大化しタイムアウトの原因になっていた。全件取得系を廃止し、各開始フローは
// idsOnly/metaOnly（IDのみ＝軽量）で選定 → 必要な問題だけ ids= で取得するプログレッシブ
// ロードに一本化した。本モジュールは後方互換のためのスタブ（何もしない）として残す。

export interface PrefetchEntry {
  questions: { questionId: string; domain?: number; examType: string }[];
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

// ── プリフェッチ（全件取得）は廃止。呼び出し互換のため no-op ──
export async function prefetchTypeA(_examType: string, _userId = 'guest'): Promise<void> {}
export async function prefetchTypeB(_examType: string, _userId: string, _prefs: FocusedPrefs): Promise<void> {}
export async function prefetchTypeC(_examType: string, _userId: string, _prefs: QuickPrefs): Promise<void> {}

// ── キャッシュ読み出しは常に null（＝各画面のプログレッシブ・フォールバックを使う）──
export function getPrefetchA(_examType: string): PrefetchEntry | null { return null; }
export function getPrefetchB(_examType: string, _userId: string, _prefs: FocusedPrefs): PrefetchEntry | null { return null; }
export function getPrefetchC(_examType: string, _userId: string, _prefs: QuickPrefs): PrefetchEntry | null { return null; }

// ── セッション終了後のプリフェッチも廃止（no-op）──
export function schedulePrefetchAfterSession(_params: {
  examType: string;
  userId: string;
  isQuick: boolean;
  isFocused: boolean;
}): void {}
