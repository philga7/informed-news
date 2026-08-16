import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { ArticleCard } from './ArticleCard';
import type { Article, StoreMeta } from './types';

type FeedProps = {
  onUnauthorized: () => void;
};

export function Feed({ onUnauthorized }: FeedProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [meta, setMeta] = useState<StoreMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<'fetch' | 'classify' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return true;
      }
      return false;
    },
    [onUnauthorized],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getArticles();
      setArticles(data.articles);
      setMeta(data.meta);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Failed to load articles');
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setActionBusy('fetch');
    setError(null);
    setStatus(null);
    try {
      const result = await api.refresh();
      setStatus(`Fetched ${result.articles.length} article(s).`);
      await load();
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setActionBusy(null);
    }
  };

  const classifyNew = async () => {
    setActionBusy('classify');
    setError(null);
    setStatus(null);
    try {
      const result = await api.classifyNew();
      setStatus(`Classified ${result.articles.length} article(s).`);
      await load();
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err instanceof Error ? err.message : 'Classify failed');
    } finally {
      setActionBusy(null);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Session clear is best-effort; still leave the UI.
    }
    onUnauthorized();
  };

  return (
    <main className="shell feed">
      <header className="feed-header">
        <div>
          <h1>Informed News</h1>
          <p className="honesty banner">
            AI-assisted framing analysis — not ground truth.
          </p>
        </div>
        <button type="button" className="ghost" onClick={() => void logout()}>
          Sign out
        </button>
      </header>

      <div className="actions">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={actionBusy !== null}
        >
          {actionBusy === 'fetch' ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={() => void classifyNew()}
          disabled={actionBusy !== null}
        >
          {actionBusy === 'classify' ? 'Classifying…' : 'Classify new'}
        </button>
      </div>

      {meta?.lastFetchAt && (
        <p className="muted meta-line">
          Last fetch: {new Date(meta.lastFetchAt).toLocaleString()}
          {meta.lastError ? ` · Store note: ${meta.lastError}` : ''}
        </p>
      )}
      {status && <p className="status">{status}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted">Loading feed…</p>
      ) : articles.length === 0 ? (
        <p className="muted">No articles yet. Use Refresh to pull the feed.</p>
      ) : (
        <ul className="article-list">
          {articles.map((article) => (
            <li key={article.id}>
              <ArticleCard article={article} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
