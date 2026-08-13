import { useState, type FormEvent } from 'react';
import { api } from './api';

type LoginProps = {
  onSuccess: () => void;
};

export function Login({ onSuccess }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell">
      <header className="brand">
        <h1>Informed News</h1>
        <p className="muted">MVP — password access</p>
      </header>
      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          required
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
