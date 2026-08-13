/**
 * X.com Tweet Selection Modal
 * 
 * Modal for managing selected tweets and creating Source Records linked to Topics.
 * Uses the existing LinkToTopicModal pattern for Topic creation/linking.
 */

import { useState, useCallback } from 'react';
import { X, FileText, Combine, ChevronRight, Loader2, AlertCircle, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useAuth } from '../../hooks/useAuth';
import { LinkToTopicModal } from '../Topics/LinkToTopicModal';
import type { SelectedTweet, TweetData } from '../../types/xcom';
import {
  formatTweetAsTitle,
  formatTweetAsContent,
  formatMultipleTweetsAsContent,
} from '../../utils/xcomTweetParser';
import { xcomProfilesService } from '../../services';

// ============================================================================
// TYPES
// ============================================================================

interface XcomTweetSelectionModalProps {
  /** Selected tweets to process */
  selectedTweets: SelectedTweet[];
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when tweets are successfully processed */
  onSuccess: (recordIds: string[]) => void;
}

type ProcessingMode = 'individual' | 'combined';

interface ProcessingResult {
  success: boolean;
  recordIds: string[];
  errors: string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function XcomTweetSelectionModal({
  selectedTweets,
  onClose,
  onSuccess,
}: XcomTweetSelectionModalProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id;

  // State
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('individual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRecordIds, setCreatedRecordIds] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [currentRecordIdForLink, setCurrentRecordIdForLink] = useState<string | null>(null);

  /**
   * Create Source Records from selected tweets
   */
  const handleCreateRecords = useCallback(async () => {
    if (!orgId || selectedTweets.length === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await xcomProfilesService.createSourceRecordsFromTweets({
        organizationId: orgId,
        userId: user?.id,
        tweets: selectedTweets,
        combineIntoSingle: processingMode === 'combined',
      });

      if (result.success && result.recordIds.length > 0) {
        setCreatedRecordIds(result.recordIds);
        
        // If single record, show link modal immediately
        if (result.recordIds.length === 1) {
          setCurrentRecordIdForLink(result.recordIds[0]);
          setShowLinkModal(true);
        } else {
          // Multiple records created - show success and let user link each
          onSuccess(result.recordIds);
        }
      } else if (result.errors && result.errors.length > 0) {
        setError(result.errors.join('; '));
      }
    } catch (err) {
      console.error('Error creating source records from tweets:', err);
      setError(err instanceof Error ? err.message : 'Failed to create source records');
    } finally {
      setIsProcessing(false);
    }
  }, [orgId, user?.id, selectedTweets, processingMode, onSuccess]);

  /**
   * Handle successful topic linking
   */
  const handleLinkSuccess = useCallback(
    async (topicIds: string[]) => {
      // If we have more records to link, continue
      const currentIndex = createdRecordIds.indexOf(currentRecordIdForLink || '');
      if (currentIndex < createdRecordIds.length - 1) {
        setCurrentRecordIdForLink(createdRecordIds[currentIndex + 1]);
      } else {
        // All done
        setShowLinkModal(false);
        onSuccess(createdRecordIds);
      }
    },
    [createdRecordIds, currentRecordIdForLink, onSuccess]
  );

  /**
   * Handle link modal close (skip linking)
   */
  const handleLinkClose = useCallback(() => {
    setShowLinkModal(false);
    // Even if user skips linking, records were created
    if (createdRecordIds.length > 0) {
      onSuccess(createdRecordIds);
    } else {
      onClose();
    }
  }, [createdRecordIds, onSuccess, onClose]);

  // If showing link modal, render it instead
  if (showLinkModal && currentRecordIdForLink) {
    return (
      <LinkToTopicModal
        sourceRecordId={currentRecordIdForLink}
        recordTitle={
          processingMode === 'combined'
            ? `Combined tweets (${selectedTweets.length} tweets)`
            : formatTweetAsTitle(selectedTweets[createdRecordIds.indexOf(currentRecordIdForLink)] || selectedTweets[0])
        }
        organizationId={orgId}
        mode="multi"
        filterActiveOnly={false}
        onLink={handleLinkSuccess}
        onClose={handleLinkClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <div>
            <h2 className="text-xl font-bold text-stone-100">
              Create Source Records from Tweets
            </h2>
            <p className="text-sm text-stone-400 mt-1">
              {selectedTweets.length} tweet{selectedTweets.length !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-stone-400 hover:text-stone-200 transition-colors duration-250 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-900/30 border border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-200 font-medium">Error</p>
                <p className="text-red-300 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Processing Mode Selection */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-stone-300">
              How would you like to create Source Records?
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Individual Records Option */}
              <button
                type="button"
                onClick={() => setProcessingMode('individual')}
                disabled={isProcessing}
                className={`p-4 rounded-lg border transition-all duration-250 text-left ${
                  processingMode === 'individual'
                    ? 'border-blue-600 bg-blue-900/20'
                    : 'border-stone-700 hover:border-stone-600'
                } disabled:opacity-50`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <FileText className={`w-5 h-5 ${processingMode === 'individual' ? 'text-blue-400' : 'text-stone-400'}`} />
                  <span className="font-medium text-stone-100">Individual Records</span>
                </div>
                <p className="text-sm text-stone-400">
                  Create a separate Source Record for each selected tweet.
                </p>
                <p className="text-xs text-stone-500 mt-2">
                  Creates {selectedTweets.length} record{selectedTweets.length !== 1 ? 's' : ''}
                </p>
              </button>

              {/* Combined Record Option */}
              <button
                type="button"
                onClick={() => setProcessingMode('combined')}
                disabled={isProcessing || selectedTweets.length < 2}
                className={`p-4 rounded-lg border transition-all duration-250 text-left ${
                  processingMode === 'combined'
                    ? 'border-blue-600 bg-blue-900/20'
                    : 'border-stone-700 hover:border-stone-600'
                } disabled:opacity-50 ${selectedTweets.length < 2 ? 'cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Combine className={`w-5 h-5 ${processingMode === 'combined' ? 'text-blue-400' : 'text-stone-400'}`} />
                  <span className="font-medium text-stone-100">Combined Record</span>
                </div>
                <p className="text-sm text-stone-400">
                  Combine all selected tweets into a single Source Record.
                </p>
                <p className="text-xs text-stone-500 mt-2">
                  {selectedTweets.length < 2 
                    ? 'Requires 2+ tweets' 
                    : 'Creates 1 combined record'}
                </p>
              </button>
            </div>
          </div>

          {/* Selected Tweets Preview */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-stone-300">
              Selected Tweets Preview
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedTweets.map((tweet, index) => (
                <div
                  key={tweet.id}
                  className="p-3 bg-stone-800/50 border border-stone-700 rounded-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-blue-400">
                          @{tweet.authorUsername}
                        </span>
                        {tweet.timestamp && (
                          <span className="text-xs text-stone-500">
                            {tweet.timestamp.toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-stone-300 line-clamp-2">
                        {tweet.text || 'No text content'}
                      </p>
                      {(tweet.mediaUrls?.length || tweet.videoLinks?.length) && (
                        <div className="flex gap-2 mt-1">
                          {tweet.mediaUrls && tweet.mediaUrls.length > 0 && (
                            <span className="text-xs text-stone-500">
                              {tweet.mediaUrls.length} media
                            </span>
                          )}
                          {tweet.videoLinks && tweet.videoLinks.length > 0 && (
                            <span className="text-xs text-stone-500">
                              {tweet.videoLinks.length} video
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <a
                      href={tweet.tweetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-500 hover:text-stone-300 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 bg-stone-800/30 border border-stone-700 rounded-lg">
            <h4 className="text-sm font-medium text-stone-300 mb-2">Summary</h4>
            <ul className="text-sm text-stone-400 space-y-1">
              <li className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-stone-500" />
                <span>
                  {processingMode === 'individual'
                    ? `Create ${selectedTweets.length} Source Record${selectedTweets.length !== 1 ? 's' : ''}`
                    : 'Create 1 combined Source Record'}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-stone-500" />
                <span>Source: X.com (auto-created if needed)</span>
              </li>
              <li className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-stone-500" />
                <span>After creation, you can link to Topics</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-stone-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateRecords}
            disabled={isProcessing || selectedTweets.length === 0}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Create {processingMode === 'individual' ? selectedTweets.length : 1} Record
                  {processingMode === 'individual' && selectedTweets.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
