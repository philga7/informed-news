import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import type { WatchItemCategory } from '../../types/osint';

interface WatchItemFormProps {
  initialData?: {
    title: string;
    category: WatchItemCategory;
    notes?: string;
    indicatorTriggers?: string[];
  };
  onSubmit: (data: {
    title: string;
    category: WatchItemCategory;
    notes?: string;
    indicatorTriggers?: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

export function WatchItemForm({ initialData, onSubmit, onCancel }: WatchItemFormProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [category, setCategory] = useState<WatchItemCategory>(initialData?.category || 'other');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [indicatorTriggers, setIndicatorTriggers] = useState<string[]>(initialData?.indicatorTriggers || []);
  const [triggerInput, setTriggerInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddTrigger = () => {
    const trigger = triggerInput.trim();
    if (trigger && !indicatorTriggers.includes(trigger)) {
      setIndicatorTriggers([...indicatorTriggers, trigger]);
      setTriggerInput('');
    }
  };

  const handleRemoveTrigger = (index: number) => {
    setIndicatorTriggers(indicatorTriggers.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        title: title.trim(),
        category,
        notes: notes.trim() || undefined,
        indicatorTriggers: indicatorTriggers.length > 0 ? indicatorTriggers : undefined,
      });
      onCancel();
    } catch (err) {
      console.error('Error submitting watch item:', err);
      setError(err instanceof Error ? err.message : 'Failed to save watch item');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <h2 className="text-2xl font-semibold text-stone-100">
              {initialData ? 'Edit Watch Item' : 'Create Watch Item'}
            </h2>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-stone-300 mb-2">
                Title *
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                placeholder="e.g., Emerging AI Regulation Trends"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-stone-300 mb-2">
                Category *
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as WatchItemCategory)}
                className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
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

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-stone-300 mb-2">
                Notes
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                placeholder="Why are you watching this? What are you looking for?"
              />
            </div>

            {/* Indicator Triggers */}
            <div>
              <label htmlFor="trigger-input" className="block text-sm font-medium text-stone-300 mb-2">
                Escalation Triggers
              </label>
              <p className="text-sm text-stone-500 mb-3">
                What conditions would warrant escalating this to a full topic?
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  id="trigger-input"
                  type="text"
                  value={triggerInput}
                  onChange={(e) => setTriggerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTrigger();
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                  placeholder="e.g., 5+ articles in 24 hours, Official announcement, etc."
                />
                <button
                  type="button"
                  onClick={handleAddTrigger}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 flex items-center gap-2"
                >
                  <Plus size={18} />
                  Add
                </button>
              </div>
              {indicatorTriggers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {indicatorTriggers.map((trigger, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-amber-900/30 text-amber-300 text-sm rounded border border-amber-800/50 flex items-center gap-2"
                    >
                      {trigger}
                      <button
                        type="button"
                        onClick={() => handleRemoveTrigger(index)}
                        className="hover:text-amber-100"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Create Watch Item'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
