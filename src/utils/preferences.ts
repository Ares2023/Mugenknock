import { API_ENDPOINT } from '../constants';

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
  patch: { examDates?: Record<string, string>; dailyGoal?: number },
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
