import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { Indicator, WatchItemCategory, IndicatorCheckFrequency } from '../../types/osint';

interface IndicatorFormProps {
  indicator?: Indicator;
  onSubmit: (data: {
    domain: WatchItemCategory;
    name: string;
    description?: string;
    sourceUrl?: string;
    checkFrequency?: IndicatorCheckFrequency;
    actionOnTrigger?: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export function IndicatorForm({ indicator, onSubmit, onCancel }: IndicatorFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    domain: indicator?.domain || 'other' as WatchItemCategory,
    name: indicator?.name || '',
    description: indicator?.description || '',
    sourceUrl: indicator?.sourceUrl || '',
    checkFrequency: indicator?.checkFrequency || 'weekly' as IndicatorCheckFrequency,
    actionOnTrigger: indicator?.actionOnTrigger || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Indicator name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        domain: formData.domain,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        sourceUrl: formData.sourceUrl.trim() || undefined,
        checkFrequency: formData.checkFrequency,
        actionOnTrigger: formData.actionOnTrigger.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save indicator');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-stone-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500" size={24} />
            <h2 className="text-xl font-semibold text-stone-100">
              {indicator ? 'Edit Indicator' : 'Create New Indicator'}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-stone-400 hover:text-stone-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Indicator Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Market Volatility Spike, Policy Change Announced"
              className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
              required
            />
          </div>

          {/* Domain */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Domain <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value as WatchItemCategory })}
              className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
              required
            >
              <option value="politics">Politics</option>
              <option value="finance">Finance</option>
              <option value="technology">Technology</option>
              <option value="local">Local</option>
              <option value="international">International</option>
              <option value="health">Health</option>
              <option value="security">Security</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Check Frequency */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Check Frequency
            </label>
            <select
              value={formData.checkFrequency}
              onChange={(e) => setFormData({ ...formData, checkFrequency: e.target.value as IndicatorCheckFrequency })}
              className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <p className="text-xs text-stone-500 mt-1">
              How often should this indicator be reviewed?
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this indicator track? What conditions should trigger it?"
              rows={3}
              className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
            />
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Source URL
            </label>
            <input
              type="url"
              value={formData.sourceUrl}
              onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
              placeholder="https://example.com/data-source"
              className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
            />
            <p className="text-xs text-stone-500 mt-1">
              Optional link to the data source or monitoring dashboard
            </p>
          </div>

          {/* Action on Trigger */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Action on Trigger
            </label>
            <textarea
              value={formData.actionOnTrigger}
              onChange={(e) => setFormData({ ...formData, actionOnTrigger: e.target.value })}
              placeholder="e.g., Create topic: Recession Risk Assessment, Alert senior analysts"
              rows={2}
              className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
            />
            <p className="text-xs text-stone-500 mt-1">
              What should happen when this indicator is triggered?
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                indicator ? 'Update Indicator' : 'Create Indicator'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

