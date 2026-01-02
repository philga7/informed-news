import { useState } from 'react';
import { X } from 'lucide-react';
import type { Source, ReliabilityRating } from '../../types/osint';

interface EditSourceModalProps {
  source: Source & { record_count?: number };
  onSave: (updates: {
    name?: string;
    url?: string;
    reliabilityRating?: ReliabilityRating;
    notes?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export function EditSourceModal({ source, onSave, onClose }: EditSourceModalProps) {
  const [name, setName] = useState(source.name);
  const [url, setUrl] = useState(source.url || '');
  const [reliabilityRating, setReliabilityRating] = useState<ReliabilityRating>(
    source.reliabilityRating
  );
  const [notes, setNotes] = useState(source.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSubmitting(true);
    setError(null);

    try {
      await onSave({
        name: name.trim() || undefined,
        url: url.trim() || undefined,
        reliabilityRating,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Error saving source:', err);
      setError(err instanceof Error ? err.message : 'Failed to save source');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReliabilityColor = (rating: ReliabilityRating) => {
    switch (rating) {
      case 'HIGH':
        return 'bg-green-600 hover:bg-green-700';
      case 'MEDIUM':
        return 'bg-yellow-600 hover:bg-yellow-700';
      case 'LOW':
        return 'bg-orange-600 hover:bg-orange-700';
      case 'UNKNOWN':
        return 'bg-stone-600 hover:bg-stone-700';
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <h2 className="text-2xl font-semibold text-stone-100">Edit Source</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-stone-300 mb-2">
                  Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* URL */}
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-stone-300 mb-2">
                  URL
                </label>
                <input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/feed"
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Reliability Rating */}
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-2">
                  Reliability Rating
                </label>
                <p className="text-xs text-stone-500 mb-3">
                  Assess the source's track record for accuracy and credibility
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const).map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setReliabilityRating(rating)}
                      className={`px-4 py-2 rounded-lg text-white font-medium transition-colors duration-250 ${
                        reliabilityRating === rating
                          ? getReliabilityColor(rating)
                          : 'bg-stone-700 hover:bg-stone-600'
                      }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-stone-300 mb-2">
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Add notes about source reliability, biases, or handling guidelines..."
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-stone-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

