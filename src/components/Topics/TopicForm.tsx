import { useState } from 'react';
import { X, Plus, HelpCircle } from 'lucide-react';

interface TopicFormProps {
  initialData?: {
    name: string;
    description?: string;
    keywords?: string[];
    decisionQuestion?: string;
    decisionContext?: string;
    keyIndicators?: string[];
    resolutionCriteria?: string;
  };
  onSubmit: (data: {
    name: string;
    description?: string;
    keywords?: string[];
    decisionQuestion?: string;
    decisionContext?: string;
    keyIndicators?: string[];
    resolutionCriteria?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export function TopicForm({ initialData, onSubmit, onClose }: TopicFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [keywords, setKeywords] = useState<string[]>(initialData?.keywords || []);
  const [keywordInput, setKeywordInput] = useState('');
  
  // Phase 1: Intelligence requirement fields
  const [decisionQuestion, setDecisionQuestion] = useState(initialData?.decisionQuestion || '');
  const [decisionContext, setDecisionContext] = useState(initialData?.decisionContext || '');
  const [keyIndicators, setKeyIndicators] = useState<string[]>(initialData?.keyIndicators || []);
  const [indicatorInput, setIndicatorInput] = useState('');
  const [resolutionCriteria, setResolutionCriteria] = useState(initialData?.resolutionCriteria || '');
  
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
    
    if (!name.trim()) {
      setError('Topic name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        decisionQuestion: decisionQuestion.trim() || undefined,
        decisionContext: decisionContext.trim() || undefined,
        keyIndicators: keyIndicators.length > 0 ? keyIndicators : undefined,
        resolutionCriteria: resolutionCriteria.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Error submitting topic:', err);
      setError(err instanceof Error ? err.message : 'Failed to save topic');
    } finally {
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
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <h2 className="text-2xl font-semibold text-stone-100">
              {initialData ? 'Edit Topic' : 'Create New Topic'}
            </h2>
            <button
              onClick={onClose}
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

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-stone-300 mb-2">
                Topic Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                placeholder="e.g., Cyber Security Threats"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-stone-300 mb-2">
                Description (Optional)
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
                Keywords (Optional)
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

            {/* Intelligence Requirement Section - Phase 1 */}
            <div className="pt-6 border-t border-stone-700">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-stone-200">Intelligence Requirement</h3>
                <div className="group relative">
                  <HelpCircle size={18} className="text-stone-500 cursor-help" />
                  <div className="absolute left-0 top-6 w-80 p-3 bg-stone-800 border border-stone-700 rounded-lg text-xs text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                    <p className="font-medium mb-1">Intelligence-Driven Approach</p>
                    <p className="italic mb-2">"Topics come from questions. Questions come from decisions."</p>
                    <p>Define what decision this topic supports, what would change your mind, and when you'll know enough to act.</p>
                  </div>
                </div>
                <span className="text-xs text-stone-500">(Recommended)</span>
              </div>

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
                <p className="text-xs text-stone-500 mt-1">
                  Example: "Is Actor X developing capability Y?" or "What is the likelihood of Event Z?"
                </p>
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
                <p className="text-xs text-stone-500 mt-1">
                  Explain why this matters and what decision-maker needs this information.
                </p>
              </div>

              {/* Key Indicators */}
              <div className="mb-4">
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
                  <div className="flex flex-wrap gap-2 mb-2">
                    {keyIndicators.map((indicator, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-blue-900/30 text-blue-300 text-sm rounded flex items-center gap-2 border border-blue-800"
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
                <p className="text-xs text-stone-500">
                  Observable indicators that would confirm or refute your hypothesis.
                </p>
              </div>

              {/* Resolution Criteria */}
              <div>
                <label htmlFor="resolution-criteria" className="block text-sm font-medium text-stone-300 mb-2">
                  Resolution Criteria
                </label>
                <textarea
                  id="resolution-criteria"
                  value={resolutionCriteria}
                  onChange={(e) => setResolutionCriteria(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                  placeholder="When would this question be considered answered?"
                />
                <p className="text-xs text-stone-500 mt-1">
                  Define the conditions or level of confidence needed to close this topic.
                </p>
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
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : initialData ? 'Update Topic' : 'Create Topic'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}


