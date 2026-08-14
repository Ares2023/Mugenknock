import { fetchAuthSession } from 'aws-amplify/auth';

// API_ENDPOINT 宛の fetch に Cognito idToken(Authorization: Bearer) を自動付与するラッパ。
// これにより全 /users/me 等の呼び出し（多数）を個別に書き換えず、一括でトークン化する。
// バックエンドは /users/me/* でこのトークンの sub を唯一の userId とみなす（IDOR対策）。
//
// 方針:
// - ログイン時のみ付与（ゲストは付けない＝ゲストは公開エンドポイントしか使わない）
// - 呼び出し側が既に Authorization を指定している場合（/admin 等）は上書きしない
// - トークン取得不可・input が Request オブジェクトの場合は従来どおり素通し
const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || '';

let installed = false;

export function installApiAuth(): void {
  if (installed || typeof window === 'undefined' || !API_ENDPOINT) return;
  installed = true;
  const orig = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      // Request オブジェクト渡しは既存ヘッダを壊さないよう対象外（本アプリは文字列/URLで呼ぶ）
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
      if (url && url.startsWith(API_ENDPOINT)) {
        const alreadyAuthed = init?.headers ? new Headers(init.headers).has('Authorization') : false;
        if (!alreadyAuthed) {
          const session = await fetchAuthSession();
          const token = session.tokens?.idToken?.toString();
          if (token) {
            const headers = new Headers(init?.headers || undefined);
            headers.set('Authorization', `Bearer ${token}`);
            init = { ...init, headers };
          }
        }
      }
    } catch {
      // トークン取得失敗（未ログイン・オフライン等）は素通し
    }
    return orig(input as RequestInfo | URL, init);
  };
}
