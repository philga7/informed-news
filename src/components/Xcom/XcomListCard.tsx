/**
 * X.com List Card
 * 
 * Card component for displaying an X.com list with embed preview,
 * edit/delete buttons, and drag handle for reordering.
 * 
 * Phase 8: Layout & Styling
 * - Support for grid and list view modes
 * - Improved timeline height constraints
 * - Better visual hierarchy
 */

import { useState } from 'react';
import { Edit2, Trash2, Settings, GripVertical, List, ExternalLink, FileText } from 'lucide-react';
import type { XcomList } from '../../types/xcom';
import { XcomListTimelineEmbed } from './XcomListTimelineEmbed';
import { XcomListSettingsModal } from './XcomListSettingsModal';
import { XcomTweetUrlModal } from './XcomTweetUrlModal';
import { useToast } from '../../context/ToastContext';

type ViewMode = 'grid' | 'list';

interface XcomListCardProps {
  list: XcomList;
  onEdit: (list: XcomList) => void;
  onDelete: (listId: string) => void;
  onUpdateSettings: (listId: string, settings: XcomList['settings']) => Promise<void>;
  isDeleting?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  viewMode?: ViewMode;
}

export function XcomListCard({
  list,
  onEdit,
  onDelete,
  onUpdateSettings,
  isDeleting = false,
  dragHandleProps,
  viewMode = 'grid',
}: XcomListCardProps) {
  const { showToast } = useToast();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTweetUrlModal, setShowTweetUrlModal] = useState(false);

  const handleDelete = () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    onDelete(list.id);
    setShowDeleteConfirm(false);
  };

  const handleSaveSettings = async (settings: XcomList['settings']) => {
    await onUpdateSettings(list.id, settings);
    setShowSettingsModal(false);
  };

  const handleTweetSuccess = (recordIds: string[]) => {
    setShowTweetUrlModal(false);
    showToast({
      type: 'success',
      message: `Created ${recordIds.length} Source Record${recordIds.length !== 1 ? 's' : ''} from tweets`,
    });
  };

  // Generate list URL for external link
  const listUrl = `https://twitter.com/${list.ownerScreenName}/lists/${list.slug}`;

  // List view layout - horizontal card
  if (viewMode === 'list') {
    return (
      <>
        <div
          className={`bg-stone-900 border rounded-lg overflow-hidden transition-all ${
            list.enabled
              ? 'border-stone-800 hover:border-stone-700'
              : 'border-stone-800/50 opacity-60'
          }`}
        >
          <div className="flex items-center gap-4 p-4">
            {/* Drag Handle */}
            <button
              className="text-stone-500 hover:text-stone-400 cursor-move flex-shrink-0"
              title="Drag to reorder"
              type="button"
              {...dragHandleProps}
            >
              <GripVertical size={18} />
            </button>

            {/* List Icon */}
            <div className="w-10 h-10 bg-stone-800 rounded-full flex items-center justify-center flex-shrink-0">
              <List className="text-accent" size={20} />
            </div>

            {/* List Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-stone-200 truncate">
                {list.displayName || `${list.ownerScreenName}/${list.slug}`}
              </h3>
              <a
                href={listUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-stone-400 hover:text-accent flex items-center gap-1 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                @{list.ownerScreenName}/lists/{list.slug}
                <ExternalLink size={12} />
              </a>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!list.enabled && (
                <span className="text-xs text-stone-500 px-2 py-1 bg-stone-800 rounded">
                  Disabled
                </span>
              )}
              <button
                onClick={() => setShowTweetUrlModal(true)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-green-400 rounded-lg transition-colors"
                title="Create Source Records from tweets"
                type="button"
              >
                <FileText size={16} />
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-accent rounded-lg transition-colors"
                title="Edit settings"
                type="button"
              >
                <Settings size={16} />
              </button>
              <button
                onClick={() => onEdit(list)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-blue-400 rounded-lg transition-colors"
                title="Edit list"
                type="button"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={handleDelete}
                className={`p-2 bg-stone-800 hover:bg-red-900/30 text-stone-400 hover:text-red-400 rounded-lg transition-colors ${
                  showDeleteConfirm ? 'bg-red-900/30 text-red-400' : ''
                }`}
                title={showDeleteConfirm ? 'Click again to confirm' : 'Delete list'}
                disabled={isDeleting}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Settings Modal */}
        {showSettingsModal && (
          <XcomListSettingsModal
            list={list}
            onSave={handleSaveSettings}
            onClose={() => setShowSettingsModal(false)}
          />
        )}

        {/* Tweet URL Modal */}
        {showTweetUrlModal && (
          <XcomTweetUrlModal
            onClose={() => setShowTweetUrlModal(false)}
            onSuccess={handleTweetSuccess}
          />
        )}
      </>
    );
  }

  // Grid view layout - vertical card with timeline embed
  return (
    <>
      <div
        className={`bg-stone-900 border rounded-lg overflow-hidden transition-all flex flex-col ${
          list.enabled
            ? 'border-stone-800 hover:border-stone-700'
            : 'border-stone-800/50 opacity-60'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-stone-800 bg-stone-800/30">
          <div className="flex items-start justify-between gap-3">
            {/* Drag Handle & List Info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                className="text-stone-500 hover:text-stone-400 cursor-move flex-shrink-0"
                title="Drag to reorder"
                type="button"
                {...dragHandleProps}
              >
                <GripVertical size={18} />
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <List className="text-accent flex-shrink-0" size={18} />
                <div className="min-w-0">
                  <h3 className="font-semibold text-stone-200 truncate">
                    {list.displayName || `${list.ownerScreenName}/${list.slug}`}
                  </h3>
                  <a
                    href={listUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-stone-400 hover:text-accent flex items-center gap-1 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{list.ownerScreenName}/lists/{list.slug}
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {!list.enabled && (
                <span className="text-xs text-stone-500 px-2 py-1 bg-stone-800 rounded">
                  Disabled
                </span>
              )}
              <button
                onClick={() => setShowTweetUrlModal(true)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-green-400 rounded-lg transition-colors"
                title="Create Source Records from tweets"
                type="button"
              >
                <FileText size={16} />
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-accent rounded-lg transition-colors"
                title="Edit settings"
                type="button"
              >
                <Settings size={16} />
              </button>
              <button
                onClick={() => onEdit(list)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-blue-400 rounded-lg transition-colors"
                title="Edit list"
                type="button"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={handleDelete}
                className={`p-2 bg-stone-800 hover:bg-red-900/30 text-stone-400 hover:text-red-400 rounded-lg transition-colors ${
                  showDeleteConfirm ? 'bg-red-900/30 text-red-400' : ''
                }`}
                title={showDeleteConfirm ? 'Click again to confirm' : 'Delete list'}
                disabled={isDeleting}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Embed with height constraint for scrolling */}
        {list.enabled ? (
          <div className="p-4 flex-1 overflow-auto max-h-[500px]">
            <XcomListTimelineEmbed list={list} />
          </div>
        ) : (
          <div className="p-8 text-center flex-1 flex items-center justify-center">
            <p className="text-stone-500 text-sm">This list is disabled</p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <XcomListSettingsModal
          list={list}
          onSave={handleSaveSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Tweet URL Modal */}
      {showTweetUrlModal && (
        <XcomTweetUrlModal
          onClose={() => setShowTweetUrlModal(false)}
          onSuccess={handleTweetSuccess}
        />
      )}
    </>
  );
}
