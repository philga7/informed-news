/**
 * X.com List Form
 * 
 * Modal form for creating and editing X.com lists.
 */

import { useState } from 'react';
import { X, List } from 'lucide-react';
import type { XcomList, XcomListInsert, XcomListUpdate } from '../../types/xcom';

interface XcomListFormProps {
  initialData?: XcomList | null;
  organizationId: string;
  onSubmit: (data: XcomListInsert | XcomListUpdate) => Promise<void>;
  onCancel: () => void;
}

export function XcomListForm({
  initialData,
  organizationId,
  onSubmit,
  onCancel,
}: XcomListFormProps) {
  const [ownerScreenName, setOwnerScreenName] = useState(initialData?.ownerScreenName || '');
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [displayName, setDisplayName] = useState(initialData?.displayName || '');
  const [enabled, setEnabled] = useState(initialData?.enabled !== undefined ? initialData.enabled : true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate owner screen name
    const cleanOwnerScreenName = ownerScreenName.replace(/^@/, '').trim();
    if (!cleanOwnerScreenName) {
      setError('Owner screen name is required');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanOwnerScreenName)) {
      setError('Owner screen name must contain only letters, numbers, and underscores');
      return;
    }

    // Validate slug
    const cleanSlug = slug.trim();
    if (!cleanSlug) {
      setError('Slug is required');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanSlug)) {
      setError('Slug must contain only letters, numbers, hyphens, and underscores');
      return;
    }

    try {
      setIsSubmitting(true);

      if (initialData) {
        // Update existing list
        await onSubmit({
          ownerScreenName: cleanOwnerScreenName,
          slug: cleanSlug,
          displayName: displayName.trim() || null,
          enabled,
        } as XcomListUpdate);
      } else {
        // Create new list
        await onSubmit({
          organizationId,
          ownerScreenName: cleanOwnerScreenName,
          slug: cleanSlug,
          displayName: displayName.trim() || null,
          enabled,
        } as XcomListInsert);
      }
    } catch (err) {
      console.error('Error submitting list form:', err);
      setError(err instanceof Error ? err.message : 'Failed to save list');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <div className="flex items-center gap-3">
              <List className="text-accent" size={24} />
              <h2 className="text-2xl font-semibold text-stone-100">
                {initialData ? 'Edit X.com List' : 'Create X.com List'}
              </h2>
            </div>
            <button
              onClick={onCancel}
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

            {/* Owner Screen Name */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Owner Screen Name <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-stone-400">@</span>
                <input
                  type="text"
                  value={ownerScreenName}
                  onChange={(e) => {
                    const value = e.target.value.replace(/^@/, '').trim();
                    setOwnerScreenName(value);
                  }}
                  placeholder="username"
                  className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-accent transition-colors"
                  required
                  disabled={isSubmitting}
                  pattern="[a-zA-Z0-9_]+"
                  title="Owner screen name must contain only letters, numbers, and underscores"
                />
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Enter the owner's username without @ symbol (e.g., "twitter")
              </p>
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                List Slug <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.trim())}
                placeholder="list-slug"
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-accent transition-colors"
                required
                disabled={isSubmitting}
                pattern="[a-zA-Z0-9_-]+"
                title="Slug must contain only letters, numbers, hyphens, and underscores"
              />
              <p className="mt-1 text-xs text-stone-500">
                Enter the list slug/identifier (e.g., "official-twitter-accts")
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Display Name <span className="text-stone-500 text-xs">(Optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Custom display name for this list"
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-accent transition-colors"
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-stone-500">
                Optional custom name to help identify this list in your collection
              </p>
            </div>

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between p-4 bg-stone-800/50 rounded-lg border border-stone-700">
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1">
                  Enabled
                </label>
                <p className="text-xs text-stone-500">
                  Show this list's timeline on the lists page
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                  disabled={isSubmitting}
                />
                <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
              <button
                type="button"
                onClick={onCancel}
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
                {isSubmitting ? 'Saving...' : initialData ? 'Update List' : 'Create List'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
