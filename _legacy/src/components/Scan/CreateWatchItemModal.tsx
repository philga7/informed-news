import { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { watchItemsService } from '../../services';
import type { WatchItemCategory } from '../../types/osint';

interface CreateWatchItemModalProps {
  record: {
    id: string;
    title: string;
    content: string | null;
    sourceName: string;
    sourceDomain: WatchItemCategory | null;
  };
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORY_OPTIONS: Array<{ value: WatchItemCategory; label: string; icon: string }> = [
  { value: 'politics', label: 'Politics', icon: '🏛️' },
  { value: 'finance', label: 'Finance', icon: '💰' },
  { value: 'technology', label: 'Technology', icon: '💻' },
  { value: 'local', label: 'Local', icon: '📍' },
  { value: 'international', label: 'International', icon: '🌍' },
  { value: 'health', label: 'Health', icon: '🏥' },
  { value: 'security', label: 'Security', icon: '🔒' },
  { value: 'other', label: 'Other', icon: '📋' },
];

export function CreateWatchItemModal({
  record,
  onClose,
  onCreated,
}: CreateWatchItemModalProps) {
  const { currentOrganization } = useOrganization();
  
  // Pre-fill with record data
  const [title, setTitle] = useState(record.title);
  const [category, setCategory] = useState<WatchItemCategory>(
    record.sourceDomain || 'other'
  );
  const [notes, setNotes] = useState(
    `Source: ${record.sourceName}\n\n${record.content ? record.content.substring(0, 500) : ''}`
  );
  const [indicatorTriggers, setIndicatorTriggers] = useState<string[]>([]);
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

    if (!currentOrganization) {
      setError('No organization selected');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const watchItem = await watchItemsService.create({
        organizationId: currentOrganization.id,
        title: title.trim(),
        category,
        notes: notes.trim() || undefined,
        indicatorTriggers: indicatorTriggers.length > 0 ? indicatorTriggers : undefined,
      });

      // Link the source record to the watch item
      await watchItemsService.linkRecord(watchItem.id, record.id);

      onCreated();
    } catch (err) {
      console.error('Error creating watch item:', err);
      setError(err instanceof Error ? err.message : 'Failed to create watch item');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <h2 className="text-xl font-bold text-stone-100">Create Watch Item</h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-stone-400 hover:text-stone-200 transition-colors duration-250 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-stone-300 mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
              placeholder="What are you watching for?"
              required
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-stone-300 mb-2">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as WatchItemCategory)}
              className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
              required
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.icon} {option.label}
                </option>
              ))}
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
              rows={6}
              className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
              placeholder="Context, background information, or initial observations..."
            />
            <p className="mt-1 text-xs text-stone-500">
              Pre-filled with record details. Edit as needed.
            </p>
          </div>

          {/* Indicator Triggers */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Escalation Triggers
            </label>
            <p className="text-xs text-stone-500 mb-3">
              What events or signals would cause you to escalate this to a full topic?
            </p>
            
            <div className="space-y-2">
              {indicatorTriggers.map((trigger, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2 bg-purple-900/30 border border-purple-800 rounded-lg"
                >
                  <span className="text-sm text-stone-300">{trigger}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTrigger(index)}
                    className="text-stone-400 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={triggerInput}
                  onChange={(e) => setTriggerInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTrigger();
                    }
                  }}
                  placeholder="e.g., Major policy announcement, Significant price movement..."
                  className="flex-1 px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
                />
                <button
                  type="button"
                  onClick={handleAddTrigger}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-250"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-300 mb-2">💡 About Watch Items</h4>
            <p className="text-sm text-blue-200">
              Watch items are for tracking potential topics that haven't reached escalation 
              threshold yet. They help you maintain situational awareness without the overhead 
              of full topic management.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-800 border-t border-stone-700 rounded-b-lg flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-stone-300 hover:bg-stone-700 rounded-md transition-colors duration-250 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors duration-250 disabled:opacity-50 flex items-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Watch Item
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

