/**
 * X.com Profile Settings Modal
 * 
 * Modal for editing timeline settings for an X.com profile.
 */

import { useState, useEffect } from 'react';
import { X, Settings, Palette, Maximize2, Hash } from 'lucide-react';
import type { XcomProfile, XcomTimelineSettings } from '../../types/xcom';
import { validateTimelineSettings } from '../../utils/xcomEmbed';

interface XcomProfileSettingsModalProps {
  profile: XcomProfile;
  onSave: (settings: XcomTimelineSettings) => Promise<void>;
  onClose: () => void;
}

export function XcomProfileSettingsModal({
  profile,
  onSave,
  onClose,
}: XcomProfileSettingsModalProps) {
  const [settings, setSettings] = useState<XcomTimelineSettings>(profile.settings || {});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize defaults if settings are empty
  useEffect(() => {
    if (!settings.theme) {
      setSettings((prev) => ({ ...prev, theme: 'dark' }));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate settings
    const validation = validateTimelineSettings(settings);
    if (!validation.valid) {
      setError(validation.errors.join(', '));
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(settings);
    } catch (err) {
      console.error('Error saving profile settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateChromeOption = (key: keyof NonNullable<XcomTimelineSettings['chrome']>, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      chrome: {
        ...prev.chrome,
        [key]: value,
      },
    }));
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
              <Settings className="text-accent" size={24} />
              <div>
                <h2 className="text-2xl font-semibold text-stone-100">
                  Timeline Settings
                </h2>
                <p className="text-sm text-stone-400 mt-1">
                  @{profile.username} {profile.displayName && `(${profile.displayName})`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
              disabled={isSubmitting}
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Theme */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-300 mb-3">
                <Palette size={18} className="text-accent" />
                Theme
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, theme: 'dark' }))}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${
                    settings.theme === 'dark'
                      ? 'bg-stone-800 border-accent text-stone-100'
                      : 'bg-stone-800/50 border-stone-700 text-stone-400 hover:border-stone-600'
                  }`}
                  disabled={isSubmitting}
                >
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, theme: 'light' }))}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${
                    settings.theme === 'light'
                      ? 'bg-stone-800 border-accent text-stone-100'
                      : 'bg-stone-800/50 border-stone-700 text-stone-400 hover:border-stone-600'
                  }`}
                  disabled={isSubmitting}
                >
                  Light
                </button>
              </div>
            </div>

            {/* Tweet Limit */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-300 mb-2">
                <Hash size={18} className="text-accent" />
                Tweet Limit
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={settings.tweetLimit || ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                  setSettings((prev) => ({ ...prev, tweetLimit: value || undefined }));
                }}
                placeholder="Unlimited (leave empty)"
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-accent transition-colors"
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-stone-500">
                Number of tweets to display (1-20). Leave empty for unlimited.
              </p>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-4">
              {/* Width */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-stone-300 mb-2">
                  <Maximize2 size={18} className="text-accent" />
                  Width (px)
                </label>
                <input
                  type="number"
                  min="180"
                  max="520"
                  value={settings.width || ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                    setSettings((prev) => ({ ...prev, width: value || undefined }));
                  }}
                  placeholder="Auto (180-520px)"
                  className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-accent transition-colors"
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-xs text-stone-500">
                  Width in pixels (180-520px)
                </p>
              </div>

              {/* Height */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-stone-300 mb-2">
                  <Maximize2 size={18} className="text-accent rotate-90" />
                  Height (px)
                </label>
                <input
                  type="number"
                  min="200"
                  value={settings.height || ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                    setSettings((prev) => ({ ...prev, height: value || undefined }));
                  }}
                  placeholder="Auto"
                  className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-accent transition-colors"
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-xs text-stone-500">
                  Height in pixels (leave empty for auto)
                </p>
              </div>
            </div>

            {/* Chrome Options */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-3">
                Chrome Options
              </label>
              <div className="space-y-2 p-4 bg-stone-800/50 rounded-lg border border-stone-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.chrome?.noheader || false}
                    onChange={(e) => updateChromeOption('noheader', e.target.checked)}
                    className="w-4 h-4 text-accent bg-stone-700 border-stone-600 rounded focus:ring-accent focus:ring-2"
                    disabled={isSubmitting}
                  />
                  <span className="text-stone-300 text-sm">Hide header</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.chrome?.nofooter || false}
                    onChange={(e) => updateChromeOption('nofooter', e.target.checked)}
                    className="w-4 h-4 text-accent bg-stone-700 border-stone-600 rounded focus:ring-accent focus:ring-2"
                    disabled={isSubmitting}
                  />
                  <span className="text-stone-300 text-sm">Hide footer</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.chrome?.noborders || false}
                    onChange={(e) => updateChromeOption('noborders', e.target.checked)}
                    className="w-4 h-4 text-accent bg-stone-700 border-stone-600 rounded focus:ring-accent focus:ring-2"
                    disabled={isSubmitting}
                  />
                  <span className="text-stone-300 text-sm">Hide borders</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.chrome?.noscrollbar || false}
                    onChange={(e) => updateChromeOption('noscrollbar', e.target.checked)}
                    className="w-4 h-4 text-accent bg-stone-700 border-stone-600 rounded focus:ring-accent focus:ring-2"
                    disabled={isSubmitting}
                  />
                  <span className="text-stone-300 text-sm">Hide scrollbar</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.chrome?.transparent || false}
                    onChange={(e) => updateChromeOption('transparent', e.target.checked)}
                    className="w-4 h-4 text-accent bg-stone-700 border-stone-600 rounded focus:ring-accent focus:ring-2"
                    disabled={isSubmitting}
                  />
                  <span className="text-stone-300 text-sm">Transparent background</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-stone-400 hover:text-stone-300 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-stone-900 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
