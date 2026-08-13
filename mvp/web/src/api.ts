import type { Article, StoreMeta } from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { error: text };
    }
  }

  if (!res.ok) {
    const errObj = body as { error?: string } | null;
    throw new ApiError(errObj?.error || res.statusText || 'Request failed', res.status);
  }

  return body as T;
}

export const api = {
  async login(password: string): Promise<void> {
    await request<{ ok: boolean }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  async logout(): Promise<void> {
    await request<{ ok: boolean }>('/api/logout', { method: 'POST' });
  },

  async getArticles(): Promise<{ articles: Article[]; meta: StoreMeta }> {
    return request('/api/articles');
  },

  async fetchCfp(): Promise<{ articles: Article[] }> {
    return request('/api/fetch', { method: 'POST', body: JSON.stringify({}) });
  },

  async classifyNew(): Promise<{ articles: Article[] }> {
    return request('/api/classify', { method: 'POST', body: JSON.stringify({}) });
  },
};
