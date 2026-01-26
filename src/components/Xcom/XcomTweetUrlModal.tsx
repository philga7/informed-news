/**
 * X.com Tweet URL Modal
 * 
 * Modal for manually entering tweet URLs to create Source Records.
 * Since embedded Twitter timelines use cross-origin iframes that can't be
 * directly manipulated, this provides a practical way to capture tweets.
 */

import { useState, useCallback } from 'react';
import { X, Link2, Plus, Trash2, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import type { TweetData, SelectedTweet } from '../../types/xcom';
import { XcomTweetSelectionModal } from './XcomTweetSelectionModal';

// ============================================================================
// TYPES
// ============================================================================

interface XcomTweetUrlModalProps {
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when tweets are successfully processed */
  onSuccess: (recordIds: string[]) => void;
}

interface TweetUrlEntry {
  id: string;
  url: string;
  error?: string;
  parsedData?: TweetData;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse tweet URL to extract username and tweet ID
 */
function parseTweetUrl(url: string): { username: string; tweetId: string } | null {
  // Clean and normalize URL
  let cleanUrl = url.trim();
  
  // Handle both twitter.com and x.com URLs
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i,
    /(?:https?:\/\/)?(?:mobile\.)?(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match && match[1] && match[2]) {
      return {
        username: match[1],
        tweetId: match[2],
      };
    }
  }

  return null;
}

/**
 * Validate tweet URL format
 */
function validateTweetUrl(url: string): string | null {
  if (!url.trim()) {
    return 'URL is required';
  }

  const parsed = parseTweetUrl(url);
  if (!parsed) {
    return 'Invalid tweet URL format. Expected: https://twitter.com/username/status/123456 or https://x.com/username/status/123456';
  }

  return null;
}

/**
 * Generate a unique ID for entries
 */
function generateId(): string {
  return `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function XcomTweetUrlModal({
  onClose,
  onSuccess,
}: XcomTweetUrlModalProps) {
  // State
  const [entries, setEntries] = useState<TweetUrlEntry[]>([
    { id: generateId(), url: '' },
  ]);
  const [isValidating, setIsValidating] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [selectedTweets, setSelectedTweets] = useState<SelectedTweet[]>([]);

  /**
   * Add a new URL entry
   */
  const handleAddEntry = useCallback(() => {
    setEntries((prev) => [...prev, { id: generateId(), url: '' }]);
  }, []);

  /**
   * Remove a URL entry
   */
  const handleRemoveEntry = useCallback((id: string) => {
    setEntries((prev) => {
      // Keep at least one entry
      if (prev.length <= 1) {
        return [{ id: generateId(), url: '' }];
      }
      return prev.filter((entry) => entry.id !== id);
    });
  }, []);

  /**
   * Update a URL entry
   */
  const handleUpdateEntry = useCallback((id: string, url: string) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, url, error: undefined, parsedData: undefined } : entry
      )
    );
  }, []);

  /**
   * Validate and parse all entries
   */
  const handleValidateAndContinue = useCallback(async () => {
    setIsValidating(true);

    // Validate all entries
    const validatedEntries = entries.map((entry) => {
      const error = validateTweetUrl(entry.url);
      if (error) {
        return { ...entry, error };
      }

      const parsed = parseTweetUrl(entry.url);
      if (!parsed) {
        return { ...entry, error: 'Failed to parse URL' };
      }

      // Create TweetData from parsed URL
      const tweetData: TweetData = {
        text: '', // Will be populated if user provides description
        authorUsername: parsed.username,
        tweetUrl: entry.url.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/, 'https://'),
      };

      return { ...entry, error: undefined, parsedData: tweetData };
    });

    setEntries(validatedEntries);

    // Check if any entries have errors
    const hasErrors = validatedEntries.some((entry) => entry.error);
    if (hasErrors) {
      setIsValidating(false);
      return;
    }

    // Filter valid entries and check for duplicates
    const validEntries = validatedEntries.filter((entry) => entry.parsedData);
    const uniqueUrls = new Set<string>();
    const uniqueEntries: TweetUrlEntry[] = [];

    for (const entry of validEntries) {
      const normalizedUrl = entry.parsedData!.tweetUrl.toLowerCase();
      if (!uniqueUrls.has(normalizedUrl)) {
        uniqueUrls.add(normalizedUrl);
        uniqueEntries.push(entry);
      }
    }

    if (uniqueEntries.length === 0) {
      setIsValidating(false);
      return;
    }

    // Convert to SelectedTweet format
    const tweets: SelectedTweet[] = uniqueEntries.map((entry) => ({
      ...entry.parsedData!,
      id: entry.parsedData!.tweetUrl,
      combineWithOthers: false,
    }));

    setSelectedTweets(tweets);
    setShowSelectionModal(true);
    setIsValidating(false);
  }, [entries]);

  /**
   * Handle successful processing
   */
  const handleSuccess = useCallback((recordIds: string[]) => {
    setShowSelectionModal(false);
    onSuccess(recordIds);
  }, [onSuccess]);

  /**
   * Handle paste event to add multiple URLs at once
   */
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>, entryId: string) => {
    const pastedText = e.clipboardData.getData('text');
    
    // Check if pasted text contains multiple URLs (newline or space separated)
    const lines = pastedText.split(/[\n\r\s]+/).filter(Boolean);
    
    if (lines.length > 1) {
      e.preventDefault();
      
      // Add entries for each URL
      setEntries((prev) => {
        const currentIndex = prev.findIndex((entry) => entry.id === entryId);
        const newEntries = [...prev];
        
        // Update the current entry with the first URL
        newEntries[currentIndex] = { ...newEntries[currentIndex], url: lines[0] };
        
        // Add new entries for the rest
        for (let i = 1; i < lines.length; i++) {
          newEntries.splice(currentIndex + i, 0, {
            id: generateId(),
            url: lines[i],
          });
        }
        
        return newEntries;
      });
    }
  }, []);

  // Show selection modal if we have validated tweets
  if (showSelectionModal && selectedTweets.length > 0) {
    return (
      <XcomTweetSelectionModal
        selectedTweets={selectedTweets}
        onClose={() => {
          setShowSelectionModal(false);
          setSelectedTweets([]);
        }}
        onSuccess={handleSuccess}
      />
    );
  }

  const validEntryCount = entries.filter((e) => e.url.trim() && !e.error).length;

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
              Enter tweet URLs to create Source Records
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isValidating}
            className="text-stone-400 hover:text-stone-200 transition-colors duration-250 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Instructions */}
          <div className="p-4 bg-stone-800/30 border border-stone-700 rounded-lg">
            <p className="text-sm text-stone-300">
              <strong>How to use:</strong> Copy tweet URLs from X.com/Twitter and paste them below.
              You can paste multiple URLs at once (one per line) or add them individually.
            </p>
            <p className="text-xs text-stone-500 mt-2">
              Supported formats: https://twitter.com/username/status/123456 or https://x.com/username/status/123456
            </p>
          </div>

          {/* URL Entries */}
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <div key={entry.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500 w-4 h-4" />
                      <input
                        type="url"
                        value={entry.url}
                        onChange={(e) => handleUpdateEntry(entry.id, e.target.value)}
                        onPaste={(e) => handlePaste(e, entry.id)}
                        placeholder="https://twitter.com/username/status/123456"
                        className={`w-full pl-10 pr-4 py-2 bg-stone-800 border rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 ${
                          entry.error
                            ? 'border-red-600'
                            : entry.parsedData
                            ? 'border-green-600'
                            : 'border-stone-700'
                        }`}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveEntry(entry.id)}
                    className="p-2 text-stone-500 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                {entry.error && (
                  <div className="flex items-center gap-2 text-red-400 text-sm pl-10">
                    <AlertCircle size={14} />
                    <span>{entry.error}</span>
                  </div>
                )}
                {entry.parsedData && !entry.error && (
                  <div className="flex items-center gap-2 text-green-400 text-sm pl-10">
                    <CheckCircle2 size={14} />
                    <span>@{entry.parsedData.authorUsername}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add More Button */}
          <button
            type="button"
            onClick={handleAddEntry}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-200 transition-colors text-sm"
          >
            <Plus size={16} />
            <span>Add another URL</span>
          </button>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-stone-800">
          <p className="text-sm text-stone-500">
            {validEntryCount} valid URL{validEntryCount !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isValidating}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleValidateAndContinue}
              disabled={isValidating || entries.every((e) => !e.url.trim())}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Continue</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
