import { useState, useEffect } from 'react';
import { X, Eye, AlertCircle } from 'lucide-react';
import type { Source, WatchItemCategory } from '../../types/osint';
import { retentionService, type RetentionPolicy, type RetentionPreview } from '../../services/retention.service';

interface EditSourceModalProps {
  source: Source;
  onSave: (updates: {
    name?: string;
    url?: string;
    domain?: WatchItemCategory | null;
    reliabilityRating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    notes?: string;
    scrapeExternalUrl?: boolean;
    enabled?: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

export function EditSourceModal({ source, onSave, onClose }: EditSourceModalProps) {
  const [name, setName] = useState(source.name);
  const [url, setUrl] = useState(source.url || '');
  const [domain, setDomain] = useState<WatchItemCategory | 'none'>(
    source.domain || 'none'
  );
  const [reliabilityRating, setReliabilityRating] = useState<'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'>(
    source.reliabilityRating
  );
  const [scrapeExternalUrl, setScrapeExternalUrl] = useState(source.scrapeExternalUrl || false);
  const [enabled, setEnabled] = useState(source.enabled !== undefined ? source.enabled : true);
  const [notes, setNotes] = useState(source.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  
  // Retention policy state
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy>({
    maxItems: source.retentionMaxItems,
    retentionDays: source.retentionDays,
    action: source.retentionAction || 'archive',
  });
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(false);
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Load retention policy on mount
  useEffect(() => {
    const loadPolicy = async () => {
      try {
        setIsLoadingPolicy(true);
        const policy = await retentionService.getPolicy(source.id);
        setRetentionPolicy(policy);
      } catch (err) {
        console.error('Error loading retention policy:', err);
        // Use defaults if policy doesn't exist
      } finally {
        setIsLoadingPolicy(false);
      }
    };
    loadPolicy();
  }, [source.id]);

  const handlePreview = async () => {
    try {
      setIsLoadingPreview(true);
      const previewData = await retentionService.preview(source.id);
      setPreview(previewData);
      setShowPreview(true);
    } catch (err) {
      console.error('Error previewing retention:', err);
      alert('Failed to preview retention impact');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // Save source updates
      await onSave({
        name: name.trim(),
        url: url.trim(),
        domain: domain === 'none' ? null : domain as WatchItemCategory,
        reliabilityRating,
        scrapeExternalUrl,
        enabled,
        notes: notes.trim(),
      });

      // Save retention policy
      await retentionService.updatePolicy(source.id, retentionPolicy);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <h2 className="text-xl font-semibold text-stone-100">Edit Source</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
          >
            <X size={20} className="text-stone-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Source Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                required
              />
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
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
                <option value="UNKNOWN">Unknown</option>
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

            {/* Enabled */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-4 h-4 rounded bg-stone-800 border-stone-700 text-blue-600 focus:ring-blue-500 focus:ring-2"
                />
                <div>
                  <span className="block text-sm font-medium text-stone-300">
                    Enable Feed Fetching
                  </span>
                  <p className="text-xs text-stone-500 mt-1">
                    When unchecked, this source will be skipped during automated feed ingestion. Existing source records and topic links will remain unchanged.
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

            {/* Retention Policy Section */}
            <div className="border-t border-stone-800 pt-4 mt-4">
              <h3 className="text-lg font-semibold text-stone-100 mb-3">Retention Policy</h3>
              <p className="text-xs text-stone-500 mb-4">
                Items outside the retention window will be archived/deleted unless they are linked to topics, have artifacts, linked to watch items, or are not dismissed.
              </p>

              <div className="space-y-4">
                {/* Max Items */}
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-2">
                    Max Items (optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={retentionPolicy.maxItems || ''}
                    onChange={(e) => setRetentionPolicy({
                      ...retentionPolicy,
                      maxItems: e.target.value ? parseInt(e.target.value) : null,
                    })}
                    className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                    placeholder="Keep N most recent items"
                  />
                  <p className="mt-1 text-xs text-stone-500">
                    Keep only the N most recent items from this source
                  </p>
                </div>

                {/* Retention Days */}
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-2">
                    Retention Days (optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={retentionPolicy.retentionDays || ''}
                    onChange={(e) => setRetentionPolicy({
                      ...retentionPolicy,
                      retentionDays: e.target.value ? parseInt(e.target.value) : null,
                    })}
                    className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                    placeholder="Keep items from last N days"
                  />
                  <p className="mt-1 text-xs text-stone-500">
                    Keep only items from the last N days
                  </p>
                </div>

                {/* Action */}
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-2">
                    Action
                  </label>
                  <select
                    value={retentionPolicy.action}
                    onChange={(e) => setRetentionPolicy({
                      ...retentionPolicy,
                      action: e.target.value as 'delete' | 'archive',
                    })}
                    className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="archive">Archive</option>
                    <option value="delete">Delete</option>
                  </select>
                  <p className="mt-1 text-xs text-stone-500">
                    What to do with items outside the retention window
                  </p>
                </div>

                {/* Preview Button */}
                <div>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={isLoadingPreview || (!retentionPolicy.maxItems && !retentionPolicy.retentionDays)}
                    className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Eye className="w-4 h-4" />
                    {isLoadingPreview ? 'Loading...' : 'Preview Impact'}
                  </button>
                </div>

                {/* Preview Results */}
                {showPreview && preview && (
                  <div className="bg-stone-800 border border-stone-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-stone-200">Preview Results</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-stone-400">Eligible for {retentionPolicy.action}:</span>
                        <span className="text-stone-200 font-medium">{preview.eligible}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400">Protected:</span>
                        <span className="text-green-400 font-medium">{preview.protected}</span>
                      </div>
                      {preview.sample.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-stone-700">
                          <p className="text-xs text-stone-500 mb-2">Sample records:</p>
                          <ul className="space-y-1">
                            {preview.sample.slice(0, 5).map((record) => (
                              <li key={record.id} className="text-xs text-stone-400 truncate">
                                {record.published_at
                                  ? new Date(record.published_at).toLocaleDateString()
                                  : new Date(record.ingested_at).toLocaleDateString()}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
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
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

