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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const current = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      const email = attrs.email ?? current.signInDetails?.loginId ?? current.username;
      setUser({ userId: current.userId, username: current.username, email });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUser(); }, []);

  const signOut = async () => {
    await amplifySignOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refresh: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
