import { useState } from 'react';
import { X } from 'lucide-react';
import type { WatchItemCategory } from '../../types/osint';

interface CreateSourceModalProps {
  onSubmit: (sourceData: {
    name: string;
    sourceType: 'rss' | 'api' | 'email' | 'manual';
    url?: string;
    domain?: WatchItemCategory | null;
    reliabilityRating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    notes?: string;
    scrapeExternalUrl?: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}

export function CreateSourceModal({ onSubmit, onCancel }: CreateSourceModalProps) {
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<'rss' | 'api' | 'email' | 'manual'>('rss');
  const [url, setUrl] = useState('');
  const [domain, setDomain] = useState<WatchItemCategory | 'none'>('none');
  const [reliabilityRating, setReliabilityRating] = useState<'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'>('UNKNOWN');
  const [scrapeExternalUrl, setScrapeExternalUrl] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await onSubmit({
        name: name.trim(),
        sourceType,
        url: url.trim() || undefined,
        domain: domain === 'none' ? null : domain as WatchItemCategory,
        reliabilityRating,
        scrapeExternalUrl,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <h2 className="text-xl font-semibold text-stone-100">Create Source</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            disabled={isSaving}
          >
            <X size={20} className="text-stone-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Source Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                required
                placeholder="e.g., Reuters RSS Feed"
              />
            </div>

            {/* Source Type */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Source Type <span className="text-red-400">*</span>
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as 'rss' | 'api' | 'email' | 'manual')}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                required
              >
                <option value="rss">RSS Feed</option>
                <option value="api">API</option>
                <option value="email">Email</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            {/* URL */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                placeholder="https://example.com/feed.xml"
              />
              <p className="mt-1 text-xs text-stone-500">
                Required for RSS and API sources
              </p>
            </div>

            {/* Domain */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Domain / Category
              </label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as WatchItemCategory | 'none')}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
              >
                <option value="none">None</option>
                <option value="politics">Politics</option>
                <option value="finance">Finance</option>
                <option value="technology">Technology</option>
                <option value="local">Local</option>
                <option value="international">International</option>
                <option value="health">Health</option>
                <option value="security">Security</option>
                <option value="other">Other</option>
              </select>
              <p className="mt-1 text-xs text-stone-500">
                Assign this source to a domain for better organization in scan view
              </p>
            </div>

            {/* Reliability Rating */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Reliability Rating
              </label>
              <select
                value={reliabilityRating}
                onChange={(e) => setReliabilityRating(e.target.value as 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN')}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
              >
                <option value="UNKNOWN">Unknown</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <p className="mt-1 text-xs text-stone-500">
                Rate the reliability of this source based on historical accuracy
              </p>
            </div>

            {/* Scrape External URL */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scrapeExternalUrl}
                  onChange={(e) => setScrapeExternalUrl(e.target.checked)}
                  className="w-4 h-4 rounded bg-stone-800 border-stone-700 text-blue-600 focus:ring-blue-500 focus:ring-2"
                />
                <div>
                  <span className="block text-sm font-medium text-stone-300">
                    Scrape External URLs
                  </span>
                  <p className="text-xs text-stone-500 mt-1">
                    Enable scraping to find original article URLs from aggregator sites (e.g., Citizen Free Press)
                  </p>
                </div>
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Add any notes about this source..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSaving}
            >
              {isSaving ? 'Creating...' : 'Create Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

