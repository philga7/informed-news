import { useState } from 'react';
import { X } from 'lucide-react';

interface EditLinkModalProps {
  link: {
    id: string;
    relevanceScore: number | null;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    assumptions: string | null;
    analystNotes: string | null;
    source_records: {
      title: string;
    };
  };
  topicId: string;
  onSave: (
    linkId: string,
    updates: {
      relevanceScore?: number;
      confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
      assumptions?: string;
      analystNotes?: string;
    }
  ) => Promise<void>;
  onClose: () => void;
}

export function EditLinkModal({ link, topicId, onSave, onClose }: EditLinkModalProps) {
  const [confidenceLevel, setConfidenceLevel] = useState<'HIGH' | 'MEDIUM' | 'LOW'>(
    link.confidenceLevel || 'MEDIUM'
  );
  const [relevanceScore, setRelevanceScore] = useState<number>(
    link.relevanceScore !== null ? link.relevanceScore : 0.75
  );
  const [assumptions, setAssumptions] = useState(link.assumptions || '');
  const [analystNotes, setAnalystNotes] = useState(link.analystNotes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSubmitting(true);
    setError(null);

    try {
      await onSave(link.id, {
        relevanceScore,
        confidenceLevel,
        assumptions: assumptions.trim() || undefined,
        analystNotes: analystNotes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Error updating link:', err);
      setError(err instanceof Error ? err.message : 'Failed to update link');
    } finally {
      setIsSubmitting(false);
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
            <div>
              <h2 className="text-2xl font-semibold text-stone-100">Edit Link</h2>
              <p className="text-sm text-stone-400 mt-1 line-clamp-1">
                {link.source_records.title}
              </p>
            </div>
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
              {/* Confidence Level */}
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-2">
                  Confidence Level
                </label>
                <div className="flex gap-2">
                  {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setConfidenceLevel(level)}
                      className={`flex-1 px-4 py-2 rounded-lg transition-colors duration-250 ${
                        confidenceLevel === level
                          ? 'bg-blue-600 text-white'
                          : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Relevance Score */}
              <div>
                <label htmlFor="relevance" className="block text-sm font-medium text-stone-300 mb-2">
                  Relevance Score: {(relevanceScore * 100).toFixed(0)}%
                </label>
                <input
                  id="relevance"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={relevanceScore}
                  onChange={(e) => setRelevanceScore(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Assumptions */}
              <div>
                <label htmlFor="assumptions" className="block text-sm font-medium text-stone-300 mb-2">
                  Assumptions *
                </label>
                <p className="text-xs text-stone-500 mb-2">
                  What assumptions underlie this link? Be explicit about what you're inferring or taking for granted.
                </p>
                <textarea
                  id="assumptions"
                  value={assumptions}
                  onChange={(e) => setAssumptions(e.target.value)}
                  rows={3}
                  required
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                  placeholder="e.g., 'Assuming this source has direct access to the subject matter...'"
                />
              </div>

              {/* Analyst Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-stone-300 mb-2">
                  Analyst Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={analystNotes}
                  onChange={(e) => setAnalystNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                  placeholder="Add any relevant notes or context..."
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
                disabled={isSubmitting || !assumptions.trim()}
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

