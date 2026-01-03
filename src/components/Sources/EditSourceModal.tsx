import { useState } from 'react';
import { X } from 'lucide-react';
import type { Source, WatchItemCategory } from '../../types/osint';

interface EditSourceModalProps {
  source: Source;
  onSave: (updates: {
    name?: string;
    url?: string;
    domain?: WatchItemCategory | null;
    reliabilityRating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    notes?: string;
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
  const [notes, setNotes] = useState(source.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        name: name.trim(),
        url: url.trim(),
        domain: domain === 'none' ? null : domain as WatchItemCategory,
        reliabilityRating,
        notes: notes.trim(),
      });
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

