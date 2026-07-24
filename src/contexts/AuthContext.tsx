'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, fetchUserAttributes, signOut as amplifySignOut } from 'aws-amplify/auth';

type AuthUser = {
  userId: string;
  username: string;
  email: string;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
});

// 「過去にログインした経験があるか」の楽観的ヒント（localStorage同期読み取り）。
// 静的サイト+クライアント認証では、セッション確認中(loading)は user=null のため
// 未ログイン用UIが一瞬描画されてしまう。ログイン経験者は認証確定まで未ログイン用UIを
// 抑制するために使う（未ログイン/初回訪問ユーザーは false のまま＝従来どおり即表示）。
const HAD_SESSION_KEY = 'mk_had_session';
export const hadPriorSession = (): boolean => {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(HAD_SESSION_KEY) === '1';
  } catch {
    return false;
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const current = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      const email = attrs.email ?? current.signInDetails?.loginId ?? current.username;
      setUser({ userId: current.userId, username: current.username, email });
      try { localStorage.setItem(HAD_SESSION_KEY, '1'); } catch { /* noop */ }
    } catch {
      setUser(null);
      try { localStorage.removeItem(HAD_SESSION_KEY); } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUser(); }, []);

  const signOut = async () => {
    await amplifySignOut();
    setUser(null);
    try { localStorage.removeItem(HAD_SESSION_KEY); } catch { /* noop */ }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refresh: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
