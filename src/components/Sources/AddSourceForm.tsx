import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { NewsSource, SourceType } from '../../types';
import { useApp } from '../../context/AppContext';

export function AddSourceForm() {
  const { dispatch } = useApp();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<SourceType>('rss');
  const [scrapeExternalUrl, setScrapeExternalUrl] = useState(false);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required');
      return;
    }

    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    const newSource: NewsSource = {
      id: `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      type,
      url: url.trim(),
      enabled: true,
      createdAt: new Date(),
      scrapeExternalUrl: type === 'rss' ? scrapeExternalUrl : undefined,
    };

    dispatch({ type: 'ADD_SOURCE', payload: newSource });

    setName('');
    setUrl('');
    setType('rss');
    setScrapeExternalUrl(false);
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-all duration-250 shadow-sm hover:shadow-md"
      >
        <Plus size={20} />
        Add News Source
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-stone-900 border border-stone-800 rounded-lg p-5">
      <h3 className="text-lg font-semibold text-stone-200 mb-4">Add News Source</h3>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="sourceName" className="block text-sm font-medium text-stone-300 mb-2">
            Source Name
          </label>
          <input
            id="sourceName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., TechCrunch"
            className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-250"
          />
        </div>

        <div>
          <label htmlFor="sourceType" className="block text-sm font-medium text-stone-300 mb-2">
            Source Type
          </label>
          <select
            id="sourceType"
            value={type}
            onChange={(e) => setType(e.target.value as SourceType)}
            className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-250"
          >
            <option value="rss">RSS Feed</option>
            <option value="api">News API</option>
            <option value="manual">Manual URL</option>
            <option value="scrape">Web Scraping</option>
          </select>
        </div>

        <div>
          <label htmlFor="sourceUrl" className="block text-sm font-medium text-stone-300 mb-2">
            URL
          </label>
          <input
            id="sourceUrl"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/feed"
            className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all duration-250"
          />
        </div>

        {type === 'rss' && (
          <div className="flex items-center gap-3">
            <input
              id="scrapeExternalUrl"
              type="checkbox"
              checked={scrapeExternalUrl}
              onChange={(e) => setScrapeExternalUrl(e.target.checked)}
              className="w-4 h-4 text-accent bg-stone-800 border-stone-700 rounded focus:ring-accent focus:ring-2"
            />
            <label htmlFor="scrapeExternalUrl" className="text-sm text-stone-300 cursor-pointer">
              Scrape external URLs from article pages
              <span className="block text-xs text-stone-500 mt-1">
                For sources like Citizen Free Press that link to external articles
              </span>
            </label>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-all duration-250"
          >
            Add Source
          </button>
          <button
            type="button"
            onClick={() => {
              setIsExpanded(false);
              setName('');
              setUrl('');
              setType('rss');
              setScrapeExternalUrl(false);
              setError('');
            }}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium rounded-lg transition-all duration-250"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
