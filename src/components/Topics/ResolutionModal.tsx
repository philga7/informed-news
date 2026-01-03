/**
 * Resolution Modal Component
 * 
 * Prompts user for resolution details when marking a topic as resolved.
 * Captures: resolution summary, confidence level, and optional lessons learned.
 */

import { useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import type { ResolutionConfidence } from '../../types/osint';

interface ResolutionModalProps {
  topicName: string;
  onSubmit: (resolution: {
    resolutionSummary: string;
    resolutionConfidence: ResolutionConfidence;
    lessonsLearned?: string;
  }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ResolutionModal({
  topicName,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ResolutionModalProps) {
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [resolutionConfidence, setResolutionConfidence] = useState<ResolutionConfidence>('MEDIUM');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (resolutionSummary.trim().length === 0) {
      setError('Resolution summary is required');
      return;
    }

    onSubmit({
      resolutionSummary: resolutionSummary.trim(),
      resolutionConfidence,
      lessonsLearned: lessonsLearned.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <CheckCircle className="text-green-500" size={24} />
            <div>
              <h2 className="text-xl font-bold text-stone-100">Mark Topic as Resolved</h2>
              <p className="text-sm text-stone-400 mt-1">Topic: {topicName}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors duration-200 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Guidance */}
          <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
            <p className="text-sm text-blue-200">
              <strong>Intelligence tradecraft tip:</strong> Document what was decided and why. 
              What did the evidence show? What assumptions held? What should be revisited if circumstances change?
            </p>
          </div>

          {/* Resolution Summary */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Resolution Summary <span className="text-red-400">*</span>
            </label>
            <textarea
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              placeholder="What was decided or concluded? What did the analysis show?"
              rows={4}
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-stone-950 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-600 focus:outline-none focus:border-blue-600 resize-none disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-stone-500">
              Briefly describe the outcome and key findings
            </p>
          </div>

          {/* Confidence Level */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-3">
              Confidence in Resolution <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['HIGH', 'MEDIUM', 'LOW'] as ResolutionConfidence[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setResolutionConfidence(level)}
                  disabled={isSubmitting}
                  className={`px-4 py-3 rounded-lg border-2 transition-all duration-200 disabled:opacity-50 ${
                    resolutionConfidence === level
                      ? level === 'HIGH'
                        ? 'border-green-600 bg-green-900/30 text-green-300'
                        : level === 'MEDIUM'
                        ? 'border-yellow-600 bg-yellow-900/30 text-yellow-300'
                        : 'border-orange-600 bg-orange-900/30 text-orange-300'
                      : 'border-stone-700 bg-stone-800 text-stone-400 hover:border-stone-600'
                  }`}
                >
                  <div className="font-semibold">{level}</div>
                  <div className="text-xs mt-1 opacity-80">
                    {level === 'HIGH' && 'Strong evidence'}
                    {level === 'MEDIUM' && 'Likely correct'}
                    {level === 'LOW' && 'Tentative'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Lessons Learned (Optional) */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Lessons Learned <span className="text-stone-500 font-normal">(Optional)</span>
            </label>
            <textarea
              value={lessonsLearned}
              onChange={(e) => setLessonsLearned(e.target.value)}
              placeholder="What worked well? What would you do differently? Any insights for future investigations?"
              rows={3}
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-stone-950 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-600 focus:outline-none focus:border-blue-600 resize-none disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-stone-500">
              Optional reflection to improve future analysis
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              <CheckCircle size={18} />
              {isSubmitting ? 'Marking Resolved...' : 'Mark as Resolved'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

