import React from 'react';
import { Search, Star, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function ArticleFilters() {
  const { state, dispatch } = useApp();
  const { filters, sources } = state;

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-5 space-y-4">
      <div>
        <label htmlFor="search" className="block text-sm font-medium text-stone-300 mb-2">
          <Search size={16} className="inline mr-2" />
          Search Articles
        </label>
        <input
          id="search"
          type="text"
          value={filters.searchQuery}
          onChange={(e) =>
            dispatch({ type: 'SET_FILTER', payload: { searchQuery: e.target.value } })
          }
          placeholder="Search by title or description..."
          className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-250"
        />
      </div>

      <div>
        <label htmlFor="sourceFilter" className="block text-sm font-medium text-stone-300 mb-2">
          Filter by Source
        </label>
        <select
          id="sourceFilter"
          value={filters.sourceId || ''}
          onChange={(e) =>
            dispatch({
              type: 'SET_FILTER',
              payload: { sourceId: e.target.value || null },
            })
          }
          className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-250"
        >
          <option value="">All Sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showOnlyFavorites}
            onChange={(e) =>
              dispatch({
                type: 'SET_FILTER',
                payload: { showOnlyFavorites: e.target.checked },
              })
            }
            className="w-4 h-4 rounded border-stone-700 bg-stone-800 text-accent focus:ring-accent focus:ring-offset-stone-900"
          />
          <Star size={16} className="text-amber-500" />
          <span className="text-sm text-stone-300">Favorites only</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showOnlyUnread}
            onChange={(e) =>
              dispatch({
                type: 'SET_FILTER',
                payload: { showOnlyUnread: e.target.checked },
              })
            }
            className="w-4 h-4 rounded border-stone-700 bg-stone-800 text-accent focus:ring-accent focus:ring-offset-stone-900"
          />
          <CheckCircle size={16} className="text-green-500" />
          <span className="text-sm text-stone-300">Unread only</span>
        </label>
      </div>

      {(filters.searchQuery || filters.sourceId || filters.showOnlyFavorites || filters.showOnlyUnread) && (
        <button
          onClick={() =>
            dispatch({
              type: 'SET_FILTER',
              payload: {
                searchQuery: '',
                sourceId: null,
                showOnlyFavorites: false,
                showOnlyUnread: false,
              },
            })
          }
          className="w-full px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-medium rounded-lg transition-all duration-250"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
