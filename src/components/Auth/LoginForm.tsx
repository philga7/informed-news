import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import { loginUser, createSession } from '../../utils/auth';
import { useApp } from '../../context/AppContext';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export function LoginForm({ onSwitchToRegister }: LoginFormProps) {
  const { dispatch } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await loginUser(email, password);
      if (result.success && result.user) {
        createSession(result.user);
        dispatch({ type: 'LOGIN', payload: result.user });
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-stone-200 mb-2">Welcome Back</h2>
        <p className="text-stone-400">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-300 mb-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-250"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-stone-300 mb-2">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-250"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogIn size={18} />
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-stone-400 text-sm">
          Don't have an account?{' '}
          <button
            onClick={onSwitchToRegister}
            className="text-accent hover:text-accent-hover transition-colors duration-250 font-medium"
          >
            Create one
          </button>
        </p>
      </div>
    </div>
  );
}
