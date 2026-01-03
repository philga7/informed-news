import { Link2, Eye, X, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { WatchItemCategory } from '../../types/osint';

interface QuickActionsPanelProps {
  selectedRecord: {
    id: string;
    title: string;
    url: string | null;
    publishedAt: Date | null;
    sourceName: string;
    sourceDomain: WatchItemCategory | null;
    content: string | null;
  } | null;
  onLinkToTopic: () => void;
  onCreateWatchItem: () => void;
  onDismiss: () => void;
}

export function QuickActionsPanel({
  selectedRecord,
  onLinkToTopic,
  onCreateWatchItem,
  onDismiss,
}: QuickActionsPanelProps) {
  if (!selectedRecord) {
    return (
      <div className="w-80 bg-stone-900 border-l border-stone-800 p-6">
        <div className="text-center text-stone-400">
          <p className="text-sm">No record selected</p>
          <p className="text-xs mt-2">Use ↑↓ or j/k to navigate</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-stone-900 border-l border-stone-800 overflow-y-auto">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-stone-100 mb-4">Quick Actions</h2>

        {/* Selected Record Info */}
        <div className="mb-6 p-4 bg-stone-800 rounded-lg border border-stone-700">
          <h3 className="text-sm font-semibold text-stone-200 mb-2 line-clamp-2">
            {selectedRecord.title}
          </h3>
          <div className="space-y-1 text-xs text-stone-400">
            <div>
              <span className="font-medium text-stone-300">Source:</span> {selectedRecord.sourceName}
            </div>
            {selectedRecord.publishedAt && (
              <div>
                <span className="font-medium text-stone-300">Published:</span>{' '}
                {formatDistanceToNow(selectedRecord.publishedAt, { addSuffix: true })}
              </div>
            )}
            {selectedRecord.url && (
              <a
                href={selectedRecord.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 flex items-center mt-2 transition-colors"
              >
                View source <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={onLinkToTopic}
            className="w-full flex items-center justify-between px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-250"
          >
            <div className="flex items-center">
              <Link2 className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Link to Topic</div>
                <div className="text-xs text-blue-200">Connect to existing topic</div>
              </div>
            </div>
            <kbd className="px-2 py-1 bg-blue-700 rounded text-xs">T</kbd>
          </button>

          <button
            onClick={onCreateWatchItem}
            className="w-full flex items-center justify-between px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-250"
          >
            <div className="flex items-center">
              <Eye className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Create Watch Item</div>
                <div className="text-xs text-purple-200">Track for escalation</div>
              </div>
            </div>
            <kbd className="px-2 py-1 bg-purple-700 rounded text-xs">W</kbd>
          </button>

          <button
            onClick={onDismiss}
            className="w-full flex items-center justify-between px-4 py-3 bg-stone-800 text-stone-200 rounded-lg hover:bg-stone-700 transition-colors duration-250"
          >
            <div className="flex items-center">
              <X className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Dismiss</div>
                <div className="text-xs text-stone-400">Mark as reviewed</div>
              </div>
            </div>
            <kbd className="px-2 py-1 bg-stone-700 rounded text-xs">X</kbd>
          </button>
        </div>

        {/* Keyboard Shortcuts Reference */}
        <div className="mt-8 pt-6 border-t border-stone-800">
          <h3 className="text-sm font-semibold text-stone-200 mb-3">Keyboard Shortcuts</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-stone-400">Navigate</span>
              <div className="space-x-1">
                <kbd className="px-2 py-1 bg-stone-800 border border-stone-700 rounded text-xs text-stone-300">J</kbd>
                <kbd className="px-2 py-1 bg-stone-800 border border-stone-700 rounded text-xs text-stone-300">K</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-400">Expand/Collapse</span>
              <kbd className="px-2 py-1 bg-stone-800 border border-stone-700 rounded text-xs text-stone-300">Enter</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-400">Show help</span>
              <kbd className="px-2 py-1 bg-stone-800 border border-stone-700 rounded text-xs text-stone-300">?</kbd>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-300 mb-2">💡 Tip</h3>
          <p className="text-xs text-blue-200">
            Use keyboard shortcuts for faster triage. Press <kbd className="px-1 py-0.5 bg-blue-800 rounded text-xs">?</kbd> 
            {' '}to see all shortcuts.
          </p>
        </div>
      </div>
    </div>
  );
}

