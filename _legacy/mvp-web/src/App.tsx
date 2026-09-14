import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { Feed } from './Feed';
import { Login } from './Login';

type AuthState = 'checking' | 'anonymous' | 'authenticated';

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');

  const probeSession = useCallback(async () => {
    try {
      await api.getArticles();
      setAuth('authenticated');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuth('anonymous');
        return;
      }
      // Server down or other error: show login so the user can retry after sign-in.
      setAuth('anonymous');
    }
  }, []);

  useEffect(() => {
    void probeSession();
  }, [probeSession]);

  if (auth === 'checking') {
    return (
      <main className="shell">
        <p className="muted">Checking session…</p>
      </main>
    );
  }

  if (auth === 'anonymous') {
    return <Login onSuccess={() => setAuth('authenticated')} />;
  }

  return <Feed onUnauthorized={() => setAuth('anonymous')} />;
}
