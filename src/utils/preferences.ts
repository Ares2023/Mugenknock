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
      return serverExam;
    }
    return null;
  } catch {
    return null;
  }
}
