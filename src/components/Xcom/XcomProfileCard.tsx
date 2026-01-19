/**
 * X.com Profile Card
 * 
 * Card component for displaying an X.com profile with embed preview,
 * edit/delete buttons, and drag handle for reordering.
 */

import { useState } from 'react';
import { Edit2, Trash2, Settings, GripVertical, User, ExternalLink } from 'lucide-react';
import type { XcomProfile } from '../../types/xcom';
import { XcomProfileTimelineEmbed } from './XcomProfileTimelineEmbed';
import { XcomProfileSettingsModal } from './XcomProfileSettingsModal';

interface XcomProfileCardProps {
  profile: XcomProfile;
  onEdit: (profile: XcomProfile) => void;
  onDelete: (profileId: string) => void;
  onUpdateSettings: (profileId: string, settings: XcomProfile['settings']) => Promise<void>;
  isDeleting?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}

export function XcomProfileCard({
  profile,
  onEdit,
  onDelete,
  onUpdateSettings,
  isDeleting = false,
  dragHandleProps,
}: XcomProfileCardProps) {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    onDelete(profile.id);
    setShowDeleteConfirm(false);
  };

  const handleSaveSettings = async (settings: XcomProfile['settings']) => {
    await onUpdateSettings(profile.id, settings);
    setShowSettingsModal(false);
  };

  return (
    <>
      <div
        className={`bg-stone-900 border rounded-lg overflow-hidden transition-all ${
          profile.enabled
            ? 'border-stone-800 hover:border-stone-700'
            : 'border-stone-800/50 opacity-60'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-stone-800 bg-stone-800/30">
          <div className="flex items-start justify-between gap-3">
            {/* Drag Handle & Profile Info */}
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
                <User className="text-accent flex-shrink-0" size={18} />
                <div className="min-w-0">
                  <h3 className="font-semibold text-stone-200 truncate">
                    {profile.displayName || `@${profile.username}`}
                  </h3>
                  <a
                    href={`https://twitter.com/${profile.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-stone-400 hover:text-accent flex items-center gap-1 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{profile.username}
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {!profile.enabled && (
                <span className="text-xs text-stone-500 px-2 py-1 bg-stone-800 rounded">
                  Disabled
                </span>
              )}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-accent rounded-lg transition-colors"
                title="Edit settings"
                type="button"
              >
                <Settings size={16} />
              </button>
              <button
                onClick={() => onEdit(profile)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-blue-400 rounded-lg transition-colors"
                title="Edit profile"
                type="button"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={handleDelete}
                className={`p-2 bg-stone-800 hover:bg-red-900/30 text-stone-400 hover:text-red-400 rounded-lg transition-colors ${
                  showDeleteConfirm ? 'bg-red-900/30 text-red-400' : ''
                }`}
                title={showDeleteConfirm ? 'Click again to confirm' : 'Delete profile'}
                disabled={isDeleting}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Embed */}
        {profile.enabled ? (
          <div className="p-4">
            <XcomProfileTimelineEmbed profile={profile} />
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-stone-500 text-sm">This profile is disabled</p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <XcomProfileSettingsModal
          profile={profile}
          onSave={handleSaveSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </>
  );
}
