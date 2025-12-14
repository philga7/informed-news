import React from 'react';
import { Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { NewsSource } from '../../types';
import { useApp } from '../../context/AppContext';
import { EmptyState } from '../UI/EmptyState';

export function SourceManager() {
  const { state, dispatch } = useApp();
  const { sources } = state;

  const toggleSource = (sourceId: string, enabled: boolean) => {
    dispatch({
      type: 'UPDATE_SOURCE',
      payload: {
        id: sourceId,
        updates: { enabled: !enabled },
      },
    });
  };

  const deleteSource = (sourceId: string, sourceName: string) => {
    if (confirm(`Are you sure you want to delete "${sourceName}"?`)) {
      dispatch({ type: 'DELETE_SOURCE', payload: sourceId });
    }
  };

  const getSourceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      rss: 'RSS Feed',
      api: 'News API',
      manual: 'Manual URL',
      scrape: 'Web Scraping',
    };
    return labels[type] || type;
  };

  if (sources.length === 0) {
    return (
      <EmptyState
        title="No news sources"
        description="Add a news source to get started with fetching articles."
      />
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-stone-200 mb-4">Your News Sources</h3>
      {sources.map((source) => (
        <div
          key={source.id}
          className="bg-stone-900 border border-stone-800 rounded-lg p-4 hover:border-stone-700 transition-all duration-250"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h4 className="text-stone-200 font-medium truncate">{source.name}</h4>
                <span className="px-2 py-1 bg-stone-800 text-stone-300 text-xs rounded">
                  {getSourceTypeLabel(source.type)}
                </span>
              </div>
              <p className="text-stone-400 text-sm truncate mb-2">{source.url}</p>
              {source.lastFetched && (
                <p className="text-stone-500 text-xs">
                  Last fetched: {new Date(source.lastFetched).toLocaleString()}
                </p>
              )}
              {source.errorMessage && (
                <p className="text-red-400 text-xs mt-1">{source.errorMessage}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleSource(source.id, source.enabled)}
                className={`p-2 rounded-lg transition-all duration-250 ${
                  source.enabled
                    ? 'text-green-500 hover:bg-stone-800'
                    : 'text-stone-500 hover:bg-stone-800'
                }`}
                title={source.enabled ? 'Disable source' : 'Enable source'}
              >
                {source.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
              </button>
              <button
                onClick={() => deleteSource(source.id, source.name)}
                className="p-2 text-stone-500 hover:text-red-400 hover:bg-stone-800 rounded-lg transition-all duration-250"
                title="Delete source"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
