import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api';

export type User = { id: string; email: string; name?: string };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await tokenStore.get();
        if (token) {
          const me = await api.get<User>('/auth/me');
          setUser(me);
        }
      } catch {
        await tokenStore.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password });
    await tokenStore.set(res.access_token);
    setUser(res.user);
  };

  const signUp = async (email: string, password: string, name?: string) => {
    const res = await api.post<{ access_token: string; user: User }>('/auth/register', { email, password, name });
    await tokenStore.set(res.access_token);
    setUser(res.user);
  };

  const signOut = async () => {
    await tokenStore.clear();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signIn, signUp, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
