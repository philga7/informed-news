import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <div className="flex items-center">
            <Keyboard className="w-6 h-6 text-stone-200 mr-3" />
            <h2 className="text-xl font-bold text-stone-100">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 transition-colors duration-250"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-stone-400 mb-6">
            Use keyboard shortcuts to quickly triage source records in the Environmental Scan view.
          </p>

          <div className="space-y-6">
            {/* Navigation */}
            <div>
              <h3 className="text-sm font-semibold text-stone-200 mb-3 uppercase tracking-wide">
                Navigation
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                  <span className="text-stone-300">Navigate down</span>
                  <kbd className="px-3 py-1.5 bg-stone-800 border border-stone-700 rounded text-sm font-mono text-stone-300">
                    J
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-stone-300">Navigate up</span>
                  <kbd className="px-3 py-1.5 bg-stone-800 border border-stone-700 rounded text-sm font-mono text-stone-300">
                    K
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-stone-300">Expand/collapse current item</span>
                  <kbd className="px-3 py-1.5 bg-stone-800 border border-stone-700 rounded text-sm font-mono text-stone-300">
                    Enter
                  </kbd>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div>
              <h3 className="text-sm font-semibold text-stone-200 mb-3 uppercase tracking-wide">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-stone-300">Link to topic</span>
                    <p className="text-xs text-stone-500">Connect record to existing topic</p>
                  </div>
                  <kbd className="px-3 py-1.5 bg-blue-900/50 border border-blue-800 rounded text-sm font-mono text-blue-300">
                    T
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-stone-300">Create watch item</span>
                    <p className="text-xs text-stone-500">Add to watch list for monitoring</p>
                  </div>
                  <kbd className="px-3 py-1.5 bg-purple-900/50 border border-purple-800 rounded text-sm font-mono text-purple-300">
                    W
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-stone-300">Archive</span>
                    <p className="text-xs text-stone-500">Soft delete (can be undone)</p>
                  </div>
                  <kbd className="px-3 py-1.5 bg-blue-900/50 border border-blue-800 rounded text-sm font-mono text-blue-300">
                    A
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-stone-300">Delete</span>
                    <p className="text-xs text-stone-500">Permanent removal</p>
                  </div>
                  <kbd className="px-3 py-1.5 bg-red-900/50 border border-red-800 rounded text-sm font-mono text-red-300">
                    D
                  </kbd>
                </div>
              </div>
            </div>

            {/* Help */}
            <div>
              <h3 className="text-sm font-semibold text-stone-200 mb-3 uppercase tracking-wide">
                Help
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                  <span className="text-stone-300">Show this dialog</span>
                  <kbd className="px-3 py-1.5 bg-stone-800 border border-stone-700 rounded text-sm font-mono text-stone-300">
                    ?
                  </kbd>
                </div>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-6 p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-300 mb-2">💡 Pro Tips</h4>
            <ul className="text-sm text-blue-200 space-y-1">
              <li>• Keyboard shortcuts only work when not typing in an input field</li>
              <li>• Enable "Scan Mode" to focus only on pending records</li>
              <li>• Use domain filters in the left sidebar to narrow your focus</li>
              <li>• The session timer helps you maintain time-boxed scanning sessions</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-800 border-t border-stone-700 rounded-b-lg">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md transition-colors duration-250"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}

