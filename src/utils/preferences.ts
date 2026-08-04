import { API_ENDPOINT } from '../constants';

/**
 * 目標資格を変更したときに「サクッと演習」「しっかり対策」の設定を初期化する。
 *
 * これらの設定は資格に紐づく内容（出題ドメイン・出題数・フィルタ）を持つ。
 * 特に quickExercisePrefs の domains は資格ごとのドメイン配列インデックスで
 * 保存されるため、資格をまたいで引き継ぐと別ドメインを指してしまう。
 * キーを削除すると読み出し側が {} を得て既定値に戻る。
 *
 * kvSync が removeItem を拾ってサーバへも反映するため、他端末にも初期化が伝播する。
 * 同じ資格を選び直したときは何もしない（不要な同期を発生させない）。
 */
export function resetExercisePrefsOnExamChange(
  uid: string,
  prevExam: string | null,
  nextExam: string,
): void {
  if (prevExam === nextExam) return;
  localStorage.removeItem(`quickExercisePrefs_${uid}`);
  localStorage.removeItem(`focusedExercisePrefs_${uid}`);
}

export async function syncTargetExamToServer(userId: string, uid: string, examType: string | null): Promise<void> {
  try {
    await fetch(`${API_ENDPOINT}/users/me/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targetExam: examType }),
    });
  } catch {}
}

export async function loadTargetExamFromServer(userId: string, uid: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_ENDPOINT}/users/me/preferences?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    const serverExam: string | null = data.targetExam ?? null;
    if (serverExam) {
      const localExam = localStorage.getItem(`targetExam_${uid}`);
      if (localExam !== serverExam) {
        localStorage.setItem(`targetExam_${uid}`, serverExam);
        window.dispatchEvent(new CustomEvent('targetExamChanged', { detail: serverExam }));
      }
    }

    // examDates をローカルに反映し、各変更イベントを発火
    const examDates: Record<string, string> = data.examDates ?? {};
    for (const [et, date] of Object.entries(examDates)) {
      if (!date) continue;
      const key = `examDate_${et}_${uid}`;
      if (localStorage.getItem(key) !== date) {
        localStorage.setItem(key, date);
        window.dispatchEvent(new CustomEvent('examDateChanged', { detail: { examType: et, date } }));
      }
    }

    // dailyGoal をローカルに反映
    if (data.dailyGoal != null) {
      localStorage.setItem(`dailyGoal_${uid}`, String(data.dailyGoal));
    }

    return serverExam;
  } catch {
    return null;
  }
}

/** examDates と dailyGoal をサーバーに保存する */
export async function syncPreferencesToServer(
  userId: string,
  uid: string,
  patch: { examDates?: Record<string, string>; dailyGoal?: number; obtainedCerts?: string[] },
): Promise<void> {
  try {
    await fetch(`${API_ENDPOINT}/users/me/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...patch }),
    });
  } catch {}
}

/** localStorage から全資格の受験日を収集して返す */
export function collectExamDatesFromLocal(uid: string, examTypes: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const et of examTypes) {
    const d = localStorage.getItem(`examDate_${et}_${uid}`);
    if (d) result[et] = d;
  }
  return result;
}
