import { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { indicatorsService } from '../../services';
import type { Indicator } from '../../types/osint';

interface IndicatorCheckModalProps {
  indicator: Indicator;
  onClose: () => void;
  onRefresh: () => void;
}

export function IndicatorCheckModal({ indicator, onClose, onRefresh }: IndicatorCheckModalProps) {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<'not-triggered' | 'triggered' | null>(null);
  
  // Topic creation form (shown if triggered)
  const [createTopic, setCreateTopic] = useState(false);
  const [topicData, setTopicData] = useState({
    name: '',
    description: '',
    keywords: [] as string[],
  });

  const handleMarkChecked = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      await indicatorsService.markAsChecked(indicator.id);
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as checked');
      setIsProcessing(false);
    }
  };

  const handleTrigger = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      let result;
      
      if (createTopic && topicData.name.trim()) {
        // Trigger with topic creation
        result = await indicatorsService.trigger(indicator.id, {
          name: topicData.name.trim(),
          description: topicData.description.trim() || undefined,
          keywords: topicData.keywords.filter(k => k.trim()),
        });
        
        // Navigate to the newly created topic
        if (result.topic) {
          navigate(`/topics/${result.topic.id}`);
        }
      } else {
        // Just trigger without creating topic
        result = await indicatorsService.trigger(indicator.id);
      }
      
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger indicator');
      setIsProcessing(false);
    }
  };

  const handleKeywordInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const value = e.currentTarget.value.trim();
      if (value && !topicData.keywords.includes(value)) {
        setTopicData({
          ...topicData,
          keywords: [...topicData.keywords, value],
        });
        e.currentTarget.value = '';
      }
    }
  };

  const removeKeyword = (keyword: string) => {
    setTopicData({
      ...topicData,
      keywords: topicData.keywords.filter(k => k !== keyword),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-stone-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500" size={24} />
            <h2 className="text-xl font-semibold text-stone-100">
              Check Indicator
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Indicator Info */}
          <div className="p-4 bg-stone-800/50 rounded-lg">
            <h3 className="font-semibold text-stone-100 mb-2">{indicator.name}</h3>
            {indicator.description && (
              <p className="text-sm text-stone-300 mb-2">{indicator.description}</p>
            )}
            {indicator.sourceUrl && (
              <a
                href={indicator.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                View Source →
              </a>
            )}
          </div>

          {/* Decision */}
          {!decision && (
            <div>
              <p className="text-sm text-stone-300 mb-3">
                After reviewing the indicator, has it been triggered?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDecision('not-triggered')}
                  className="flex items-center justify-center gap-2 p-4 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition-colors"
                >
                  <CheckCircle2 className="text-green-500" size={20} />
                  <span className="text-stone-200">Not Triggered</span>
                </button>
                <button
                  onClick={() => setDecision('triggered')}
                  className="flex items-center justify-center gap-2 p-4 bg-amber-900/30 hover:bg-amber-900/40 border border-amber-800 rounded-lg transition-colors"
                >
                  <AlertTriangle className="text-amber-500" size={20} />
                  <span className="text-amber-200">Triggered</span>
                </button>
              </div>
            </div>
          )}

          {/* Not Triggered Path */}
          {decision === 'not-triggered' && (
            <div className="space-y-4">
              <div className="p-4 bg-green-900/20 border border-green-800 rounded-lg">
                <div className="flex items-center gap-2 text-green-300 mb-2">
                  <CheckCircle2 size={20} />
                  <span className="font-medium">Indicator Not Triggered</span>
                </div>
                <p className="text-sm text-stone-300">
                  The indicator will be marked as checked and remain in active monitoring.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
                <button
                  onClick={() => setDecision(null)}
                  disabled={isProcessing}
                  className="px-5 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleMarkChecked}
                  disabled={isProcessing}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Mark as Checked
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Triggered Path */}
          {decision === 'triggered' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-900/20 border border-amber-800 rounded-lg">
                <div className="flex items-center gap-2 text-amber-300 mb-2">
                  <AlertTriangle size={20} />
                  <span className="font-medium">Indicator Triggered</span>
                </div>
                {indicator.actionOnTrigger && (
                  <p className="text-sm text-stone-300">
                    <span className="font-medium">Recommended action:</span> {indicator.actionOnTrigger}
                  </p>
                )}
              </div>

              {/* Option to create topic */}
              <div>
                <label className="flex items-center gap-2 text-stone-300 mb-3">
                  <input
                    type="checkbox"
                    checked={createTopic}
                    onChange={(e) => setCreateTopic(e.target.checked)}
                    className="w-4 h-4 rounded border-stone-700 bg-stone-800 text-accent focus:ring-accent"
                  />
                  <span className="text-sm">Create topic from this indicator</span>
                </label>

                {createTopic && (
                  <div className="space-y-4 pl-6 border-l-2 border-accent">
                    <div>
                      <label className="block text-sm font-medium text-stone-300 mb-2">
                        Topic Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={topicData.name}
                        onChange={(e) => setTopicData({ ...topicData, name: e.target.value })}
                        placeholder="e.g., Market Volatility Investigation"
                        className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-stone-300 mb-2">
                        Description
                      </label>
                      <textarea
                        value={topicData.description}
                        onChange={(e) => setTopicData({ ...topicData, description: e.target.value })}
                        placeholder="What should this topic investigate?"
                        rows={3}
                        className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-stone-300 mb-2">
                        Keywords
                      </label>
                      <input
                        type="text"
                        onKeyDown={handleKeywordInput}
                        placeholder="Type keyword and press Enter"
                        className="w-full px-4 py-2.5 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                      />
                      {topicData.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {topicData.keywords.map(keyword => (
                            <span
                              key={keyword}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-stone-800 text-stone-300 text-xs rounded"
                            >
                              {keyword}
                              <button
                                onClick={() => removeKeyword(keyword)}
                                className="text-stone-500 hover:text-stone-300"
                              >
                                <X size={14} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
                <button
                  onClick={() => setDecision(null)}
                  disabled={isProcessing}
                  className="px-5 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleTrigger}
                  disabled={isProcessing || (createTopic && !topicData.name.trim())}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap size={18} />
                      Trigger Indicator
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

