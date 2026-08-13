/**
 * X.com Profile Form
 * 
 * Modal form for creating and editing X.com profiles.
 * Uses comprehensive validation from xcomEmbed utilities.
 */

import { useState } from 'react';
import { X, User, AlertCircle } from 'lucide-react';
import type { XcomProfile, XcomProfileInsert, XcomProfileUpdate } from '../../types/xcom';
import {
  validateUsername,
  cleanUsername,
  XCOM_USERNAME_MAX_LENGTH,
} from '../../utils/xcomEmbed';

interface XcomProfileFormProps {
  initialData?: XcomProfile | null;
  organizationId: string;
  onSubmit: (data: XcomProfileInsert | XcomProfileUpdate) => Promise<void>;
  onCancel: () => void;
}

export function XcomProfileForm({
  initialData,
  organizationId,
  onSubmit,
  onCancel,
}: XcomProfileFormProps) {
  const [username, setUsername] = useState(initialData?.username || '');
  const [displayName, setDisplayName] = useState(initialData?.displayName || '');
  const [enabled, setEnabled] = useState(initialData?.enabled !== undefined ? initialData.enabled : true);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    // Validate username using shared validation utility
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      setErrors(usernameValidation.errors);
      return;
    }

    const cleanedUsername = cleanUsername(username);

    try {
      setIsSubmitting(true);

      if (initialData) {
        // Update existing profile
        await onSubmit({
          username: cleanedUsername,
          displayName: displayName.trim() || null,
          enabled,
        } as XcomProfileUpdate);
      } else {
        // Create new profile
        await onSubmit({
          organizationId,
          username: cleanedUsername,
          displayName: displayName.trim() || null,
          enabled,
        } as XcomProfileInsert);
      }
    } catch (err) {
      console.error('Error submitting profile form:', err);
      // Handle API errors (including validation errors from backend)
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      setErrors([message]);
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
              <User className="text-accent" size={24} />
              <h2 className="text-2xl font-semibold text-stone-100">
                {initialData ? 'Edit X.com Profile' : 'Create X.com Profile'}
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
            {errors.length > 0 && (
              <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    {errors.length === 1 ? (
                      <p className="text-red-300 text-sm">{errors[0]}</p>
                    ) : (
                      <ul className="text-red-300 text-sm list-disc list-inside space-y-1">
                        {errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                X.com Username <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-stone-400">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    const value = e.target.value.replace(/^@/, '').trim();
                    setUsername(value);
                    // Clear errors when user starts typing
                    if (errors.length > 0) setErrors([]);
                  }}
                  placeholder="username"
                  className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-accent transition-colors"
                  required
                  disabled={isSubmitting}
                  maxLength={XCOM_USERNAME_MAX_LENGTH}
                  pattern="[a-zA-Z0-9_]+"
                  title="Username must contain only letters, numbers, and underscores"
                />
              </div>
              <div className="flex justify-between mt-1">
                <p className="text-xs text-stone-500">
                  Enter the username without @ symbol (e.g., "sentdefender")
                </p>
                <p className="text-xs text-stone-500">
                  {username.length}/{XCOM_USERNAME_MAX_LENGTH}
                </p>
              </div>
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
                placeholder="Custom display name for this profile"
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-accent transition-colors"
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-stone-500">
                Optional custom name to help identify this profile in your list
              </p>
            </div>

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between p-4 bg-stone-800/50 rounded-lg border border-stone-700">
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1">
                  Enabled
                </label>
                <p className="text-xs text-stone-500">
                  Show this profile's timeline on the profiles page
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
                {isSubmitting ? 'Saving...' : initialData ? 'Update Profile' : 'Create Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
