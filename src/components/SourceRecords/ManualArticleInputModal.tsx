import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, MapPin, Film } from 'lucide-react';
import { marked } from 'marked';
import type { MediaType } from '../../types/osint';
import { sourceRecordsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';

interface ManualArticleInputModalProps {
  organizationId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  title: string;
  content: string; // Markdown
  url: string;
  sourceName: string;
  publishedAt: string;
  language: string;
  geographicIndicators: string;
}

interface FormErrors {
  title?: string;
  content?: string;
  url?: string;
  publishedAt?: string;
  language?: string;
}

/**
 * Extract geographic indicators from text (matching backend logic)
 */
function extractGeographicIndicators(text: string): string[] {
  const indicators: string[] = [];
  const commonPlaces = [
    'United States', 'USA', 'America', 'UK', 'United Kingdom',
    'China', 'Russia', 'Europe', 'Asia', 'Middle East', 'Africa',
    'Washington', 'New York', 'London', 'Moscow', 'Beijing',
    'California', 'Texas', 'Florida',
  ];

  commonPlaces.forEach(place => {
    if (text.includes(place)) {
      indicators.push(place);
    }
  });

  return [...new Set(indicators)];
}

/**
 * Detect media type from URL (matching backend pattern)
 */
function detectMediaTypeFromUrl(url: string): MediaType {
  if (!url) return 'article';
  
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) {
    return 'video';
  }
  if (/podcast|spotify\.com.*episode|anchor\.fm/i.test(url)) {
    return 'podcast';
  }
  if (/\.mp3|\.wav|\.m4a|soundcloud\.com/i.test(url)) {
    return 'audio';
  }
  return 'article';
}

/**
 * Convert Markdown to plain text
 */
function markdownToPlainText(markdown: string): string {
  if (!markdown.trim()) return '';
  
  try {
    // Parse Markdown tokens
    const tokens = marked.lexer(markdown);
    
    // Extract plain text from tokens
    function extractText(tokens: any[]): string {
      return tokens.map(token => {
        if (token.type === 'paragraph' || token.type === 'text') {
          return token.text || '';
        }
        if (token.tokens) {
          return extractText(token.tokens);
        }
        if (token.items) {
          return extractText(token.items);
        }
        if (token.type === 'heading') {
          return token.text || '';
        }
        if (token.type === 'list') {
          return token.items?.map((item: any) => 
            item.tokens ? extractText(item.tokens) : ''
          ).join('\n') || '';
        }
        return '';
      }).filter(Boolean).join('\n\n');
    }
    
    return extractText(tokens).trim();
  } catch (error) {
    console.error('Markdown conversion error:', error);
    // Fallback: strip markdown syntax manually
    return markdown
      .replace(/^#{1,6}\s+/gm, '') // Headers
      .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
      .replace(/\*(.+?)\*/g, '$1') // Italic
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Links
      .replace(/`(.+?)`/g, '$1') // Code
      .trim();
  }
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  if (!url) return true; // Optional field
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate language code (2-3 letter ISO code)
 */
function isValidLanguageCode(lang: string): boolean {
  if (!lang) return true; // Optional field
  return /^[a-z]{2,3}(-[a-z]{2,3})?$/i.test(lang.trim());
}

/**
 * Validate date format
 */
function isValidDate(dateString: string): boolean {
  if (!dateString) return true; // Optional field
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export function ManualArticleInputModal({
  organizationId,
  onClose,
  onSuccess,
}: ManualArticleInputModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<FormData>({
    title: '',
    content: '',
    url: '',
    sourceName: '',
    publishedAt: new Date().toISOString().split('T')[0],
    language: '',
    geographicIndicators: '',
  });

  const [detectedGeoIndicators, setDetectedGeoIndicators] = useState<string[]>([]);
  const [detectedMediaType, setDetectedMediaType] = useState<MediaType>('article');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPlainTextPreview, setShowPlainTextPreview] = useState(false);

  // Auto-detect geographic indicators when content changes
  useEffect(() => {
    const fullText = `${formData.title} ${formData.content}`;
    const detected = extractGeographicIndicators(fullText);
    setDetectedGeoIndicators(detected);
    
    // Update geographic indicators field if detected
    if (detected.length > 0 && !formData.geographicIndicators) {
      setFormData(prev => ({
        ...prev,
        geographicIndicators: detected.join(', '),
      }));
    }
  }, [formData.title, formData.content]);

  // Auto-detect media type when URL changes
  useEffect(() => {
    const detected = detectMediaTypeFromUrl(formData.url);
    setDetectedMediaType(detected);
  }, [formData.url]);

  // Get plain text preview
  const plainTextPreview = markdownToPlainText(formData.content);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Title validation
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    // Content validation
    const plainText = markdownToPlainText(formData.content);
    if (!plainText.trim()) {
      newErrors.content = 'Content is required';
    }

    // URL validation
    if (formData.url && !isValidUrl(formData.url)) {
      newErrors.url = 'Invalid URL format';
    }

    // Published date validation
    if (formData.publishedAt && !isValidDate(formData.publishedAt)) {
      newErrors.publishedAt = 'Invalid date format';
    }

    // Language validation
    if (formData.language && !isValidLanguageCode(formData.language)) {
      newErrors.language = 'Invalid language code (use 2-3 letter ISO code, e.g., en, es, fr)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Convert Markdown to plain text
      const plainTextContent = markdownToPlainText(formData.content);

      // Prepare geographic indicators
      const geoIndicators = formData.geographicIndicators
        ? formData.geographicIndicators.split(',').map(s => s.trim()).filter(Boolean)
        : detectedGeoIndicators;

      // Call service to create manual article
      await sourceRecordsService.createManual(organizationId, {
        title: formData.title.trim(),
        content: plainTextContent,
        url: formData.url.trim() || undefined,
        sourceName: formData.sourceName.trim() || undefined,
        language: formData.language.trim() || undefined,
        publishedAt: formData.publishedAt || undefined,
        userId: user?.id, // Include userId for audit logging
      });

      // Success - close modal and refresh list
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating manual article:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to create article');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof FormErrors];
        return newErrors;
      });
    }
  };

  const isFormValid = formData.title.trim() && plainTextPreview.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <h2 className="text-xl font-semibold text-stone-100">Add Manual Article</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            disabled={isSubmitting}
          >
            <X size={20} className="text-stone-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {submitError && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
              {submitError}
            </div>
          )}

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                className={`w-full px-3 py-2 bg-stone-800 border rounded-lg text-stone-100 focus:outline-none focus:border-blue-500 ${
                  errors.title ? 'border-red-600' : 'border-stone-700'
                }`}
                placeholder="Article title"
                required
              />
              {errors.title && (
                <p className="mt-1 text-xs text-red-400">{errors.title}</p>
              )}
            </div>

            {/* Content (Markdown) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-stone-300">
                  Content (Markdown) <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-stone-500">
                    {formData.content.length} characters
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPlainTextPreview(!showPlainTextPreview)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {showPlainTextPreview ? 'Hide' : 'Show'} Plain Text Preview
                  </button>
                </div>
              </div>
              <textarea
                value={formData.content}
                onChange={(e) => handleFieldChange('content', e.target.value)}
                rows={12}
                className={`w-full px-3 py-2 bg-stone-800 border rounded-lg text-stone-100 focus:outline-none focus:border-blue-500 resize-none font-mono text-sm ${
                  errors.content ? 'border-red-600' : 'border-stone-700'
                }`}
                placeholder="Enter article content in Markdown format..."
                required
              />
              {errors.content && (
                <p className="mt-1 text-xs text-red-400">{errors.content}</p>
              )}
              {showPlainTextPreview && plainTextPreview && (
                <div className="mt-2 p-3 bg-stone-800/50 border border-stone-700 rounded-lg">
                  <p className="text-xs text-stone-400 mb-2">Plain Text Preview:</p>
                  <p className="text-sm text-stone-300 whitespace-pre-wrap">
                    {plainTextPreview}
                  </p>
                </div>
              )}
            </div>

            {/* URL */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                URL
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => handleFieldChange('url', e.target.value)}
                className={`w-full px-3 py-2 bg-stone-800 border rounded-lg text-stone-100 focus:outline-none focus:border-blue-500 ${
                  errors.url ? 'border-red-600' : 'border-stone-700'
                }`}
                placeholder="https://example.com/article"
              />
              {errors.url && (
                <p className="mt-1 text-xs text-red-400">{errors.url}</p>
              )}
              {detectedMediaType !== 'article' && (
                <div className="mt-2 flex items-center gap-2 text-xs text-blue-400">
                  <Film size={14} />
                  <span>Detected media type: {detectedMediaType}</span>
                </div>
              )}
            </div>

            {/* Source Name */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Source Name
              </label>
              <input
                type="text"
                value={formData.sourceName}
                onChange={(e) => handleFieldChange('sourceName', e.target.value)}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                placeholder="Manual Input (default if empty)"
              />
              <p className="mt-1 text-xs text-stone-500">
                Leave empty to use default "Manual Input" source
              </p>
            </div>

            {/* Published Date */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Published Date
              </label>
              <input
                type="date"
                value={formData.publishedAt}
                onChange={(e) => handleFieldChange('publishedAt', e.target.value)}
                className={`w-full px-3 py-2 bg-stone-800 border rounded-lg text-stone-100 focus:outline-none focus:border-blue-500 ${
                  errors.publishedAt ? 'border-red-600' : 'border-stone-700'
                }`}
              />
              {errors.publishedAt && (
                <p className="mt-1 text-xs text-red-400">{errors.publishedAt}</p>
              )}
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Language
              </label>
              <input
                type="text"
                value={formData.language}
                onChange={(e) => handleFieldChange('language', e.target.value)}
                className={`w-full px-3 py-2 bg-stone-800 border rounded-lg text-stone-100 focus:outline-none focus:border-blue-500 ${
                  errors.language ? 'border-red-600' : 'border-stone-700'
                }`}
                placeholder="e.g., en, es, fr"
              />
              {errors.language && (
                <p className="mt-1 text-xs text-red-400">{errors.language}</p>
              )}
              <p className="mt-1 text-xs text-stone-500">
                ISO 639 language code (2-3 letters)
              </p>
            </div>

            {/* Geographic Indicators */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-2">
                Geographic Indicators
              </label>
              <input
                type="text"
                value={formData.geographicIndicators}
                onChange={(e) => handleFieldChange('geographicIndicators', e.target.value)}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                placeholder="Comma-separated locations"
              />
              {detectedGeoIndicators.length > 0 && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <MapPin size={14} className="text-blue-400" />
                  <span className="text-xs text-stone-400">Auto-detected:</span>
                  {detectedGeoIndicators.map((indicator, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded"
                    >
                      {indicator}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={isSubmitting || !isFormValid}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                'Create Article'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

