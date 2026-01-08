import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, TrendingUp, Plus, AlertCircle } from 'lucide-react';
import { watchItemsService, analysisService } from '../../services';
import type { WatchItemCategory } from '../../types/osint';

interface EscalateToTopicModalProps {
  watchItem: {
    id: string;
    title: string;
    category: WatchItemCategory;
    notes: string | null;
    indicatorTriggers: string[];
    signalCount: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function EscalateToTopicModal({ watchItem, onClose, onSuccess }: EscalateToTopicModalProps) {
  const navigate = useNavigate();
  const [topicName, setTopicName] = useState(watchItem.title);
  const [description, setDescription] = useState(watchItem.notes || '');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [decisionQuestion, setDecisionQuestion] = useState('');
  const [decisionContext, setDecisionContext] = useState('');
  const [keyIndicators, setKeyIndicators] = useState<string[]>(watchItem.indicatorTriggers || []);
  const [indicatorInput, setIndicatorInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddKeyword = () => {
    const keyword = keywordInput.trim();
    if (keyword && !keywords.includes(keyword)) {
      setKeywords([...keywords, keyword]);
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  const handleAddIndicator = () => {
    const indicator = indicatorInput.trim();
    if (indicator && !keyIndicators.includes(indicator)) {
      setKeyIndicators([...keyIndicators, indicator]);
      setIndicatorInput('');
    }
  };

  const handleRemoveIndicator = (index: number) => {
    setKeyIndicators(keyIndicators.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!topicName.trim()) {
      setError('Topic name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newTopic = await watchItemsService.escalateToTopic(watchItem.id, {
        name: topicName.trim(),
        description: description.trim() || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        decisionQuestion: decisionQuestion.trim() || undefined,
        decisionContext: decisionContext.trim() || undefined,
        keyIndicators: keyIndicators.length > 0 ? keyIndicators : undefined,
      });

      onSuccess();
      
      // If topic has 2+ linked records, optionally generate collection plan suggestions
      if (watchItem.signalCount >= 2) {
        const shouldGenerate = window.confirm(
          `This topic has ${watchItem.signalCount} linked source records. Would you like to generate Collection Plan suggestions?`
        );
        
        if (shouldGenerate) {
          // Generate suggestions asynchronously (non-blocking)
          analysisService.generateCollectionPlanSuggestions(newTopic.id).catch((err) => {
            // Non-blocking error - just log, don't show to user
            console.warn('Failed to generate collection plan suggestions:', err);
          });
        }
      }
      
      // Navigate to the new topic
      navigate(`/topics/${newTopic.id}`);
    } catch (err) {
      console.error('Error escalating watch item:', err);
      setError(err instanceof Error ? err.message : 'Failed to escalate watch item');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-blue-500" />
              <div>
                <h2 className="text-2xl font-semibold text-stone-100">
                  Escalate to Topic
                </h2>
                <p className="text-sm text-stone-400 mt-1">
                  Convert this watch item into a full intelligence topic
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Info Banner */}
          <div className="mx-6 mt-6 p-4 bg-blue-900/30 border border-blue-800/50 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">What happens when you escalate:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-300/90">
                <li>A new topic will be created with the information below</li>
                <li>All {watchItem.signalCount} linked source record{watchItem.signalCount !== 1 ? 's' : ''} will be transferred to the new topic</li>
                <li>This watch item will be marked as "escalated"</li>
              </ul>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            {/* Topic Name */}
            <div>
              <label htmlFor="topic-name" className="block text-sm font-medium text-stone-300 mb-2">
                Topic Name *
              </label>
              <input
                id="topic-name"
                type="text"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                placeholder="e.g., AI Regulation Impact Analysis"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-stone-300 mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                placeholder="Brief description of what this topic covers..."
              />
            </div>

            {/* Keywords */}
            <div>
              <label htmlFor="keyword-input" className="block text-sm font-medium text-stone-300 mb-2">
                Keywords
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  id="keyword-input"
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                  placeholder="Add a keyword..."
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 flex items-center gap-2"
                >
                  <Plus size={18} />
                  Add
                </button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-stone-800 text-stone-300 text-sm rounded flex items-center gap-2"
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(index)}
                        className="hover:text-stone-100"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Intelligence Requirement Section */}
            <div className="pt-6 border-t border-stone-700">
              <h3 className="text-lg font-semibold text-stone-200 mb-4">
                Intelligence Requirement (Optional)
              </h3>

              {/* Decision Question */}
              <div className="mb-4">
                <label htmlFor="decision-question" className="block text-sm font-medium text-stone-300 mb-2">
                  Decision Question
                </label>
                <input
                  id="decision-question"
                  type="text"
                  value={decisionQuestion}
                  onChange={(e) => setDecisionQuestion(e.target.value)}
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                  placeholder="What specific question are you trying to answer?"
                />
              </div>

              {/* Decision Context */}
              <div className="mb-4">
                <label htmlFor="decision-context" className="block text-sm font-medium text-stone-300 mb-2">
                  Decision Context
                </label>
                <textarea
                  id="decision-context"
                  value={decisionContext}
                  onChange={(e) => setDecisionContext(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                  placeholder="What decision or assessment depends on this intelligence?"
                />
              </div>

              {/* Key Indicators */}
              <div>
                <label htmlFor="indicator-input" className="block text-sm font-medium text-stone-300 mb-2">
                  Key Indicators
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    id="indicator-input"
                    type="text"
                    value={indicatorInput}
                    onChange={(e) => setIndicatorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddIndicator();
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                    placeholder="What evidence would change your mind?"
                  />
                  <button
                    type="button"
                    onClick={handleAddIndicator}
                    className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 flex items-center gap-2"
                  >
                    <Plus size={18} />
                    Add
                  </button>
                </div>
                {keyIndicators.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keyIndicators.map((indicator, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-blue-900/30 text-blue-300 text-sm rounded border border-blue-800/50 flex items-center gap-2"
                      >
                        {indicator}
                        <button
                          type="button"
                          onClick={() => handleRemoveIndicator(index)}
                          className="hover:text-blue-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <TrendingUp size={18} />
                {isSubmitting ? 'Escalating...' : 'Escalate to Topic'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
