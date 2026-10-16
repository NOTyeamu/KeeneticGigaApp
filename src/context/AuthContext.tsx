import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Storage } from '../lib/storage';
import type { Credentials } from '../lib/digest';

interface AuthContextValue {
  credentials: Credentials | null;
  ready: boolean;
  signIn: (creds: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await Storage.getCredentials();
      setCredentials(stored);
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (creds: Credentials) => {
    await Storage.setCredentials(creds);
    setCredentials(creds);
  }, []);

  const signOut = useCallback(async () => {
    await Storage.clearCredentials();
    setCredentials(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ credentials, ready, signIn, signOut }),
    [credentials, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
