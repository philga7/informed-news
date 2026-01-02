import { useState, useEffect } from 'react';
import { X, Search, Link as LinkIcon } from 'lucide-react';
import { sourceRecordsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';

interface LinkRecordModalProps {
  organizationId: string;
  onLink: (
    sourceRecordId: string,
    metadata?: {
      relevanceScore?: number;
      confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
      analystNotes?: string;
    }
  ) => Promise<void>;
  onClose: () => void;
}

export function LinkRecordModal({ organizationId, onLink, onClose }: LinkRecordModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [confidenceLevel, setConfidenceLevel] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [relevanceScore, setRelevanceScore] = useState<number>(0.75);
  const [analystNotes, setAnalystNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load unlinked records by default
    loadRecords();
  }, [organizationId]);

  const loadRecords = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await sourceRecordsService.getAll({
        organizationId,
        linkedStatus: 'unlinked',
        limit: 50,
      });
      setRecords(result.records);
    } catch (err) {
      console.error('Error loading records:', err);
      setError(err instanceof Error ? err.message : 'Failed to load records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadRecords();
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const results = await sourceRecordsService.search(organizationId, searchQuery);
      setRecords(results);
    } catch (err) {
      console.error('Error searching records:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedRecord) {
      setError('Please select a source record');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onLink(selectedRecord.id, {
        relevanceScore,
        confidenceLevel,
        analystNotes: analystNotes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Error linking record:', err);
      setError(err instanceof Error ? err.message : 'Failed to link record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <h2 className="text-2xl font-semibold text-stone-100">Link Source Record</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            {/* Search */}
            <div className="mb-6">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500"
                    size={20}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search by title or content..."
                    className="w-full pl-10 pr-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Records List */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : records.length === 0 ? (
              <EmptyState
                title="No records found"
                description="Try adjusting your search or check if all records are already linked."
              />
            ) : (
              <div className="space-y-2 mb-6">
                <h3 className="text-sm font-medium text-stone-400 mb-2">
                  Select a Source Record
                </h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {records.map((record) => (
                    <div
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      className={`p-4 border rounded-lg cursor-pointer transition-all duration-250 ${
                        selectedRecord?.id === record.id
                          ? 'border-blue-600 bg-blue-900/20'
                          : 'border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-stone-200 font-medium mb-1 line-clamp-2">
                            {record.title}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-stone-500">
                            <span>{record.sources?.name}</span>
                            <span>•</span>
                            <span>{formatDate(record.publishedAt)}</span>
                          </div>
                        </div>
                        {selectedRecord?.id === record.id && (
                          <LinkIcon size={20} className="text-blue-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Link Metadata Form */}
            {selectedRecord && (
              <form onSubmit={handleSubmit} className="space-y-4 border-t border-stone-800 pt-6">
                <h3 className="text-lg font-semibold text-stone-200 mb-4">Link Details</h3>

                {/* Confidence Level */}
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-2">
                    Confidence Level
                  </label>
                  <div className="flex gap-2">
                    {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setConfidenceLevel(level)}
                        className={`flex-1 px-4 py-2 rounded-lg transition-colors duration-250 ${
                          confidenceLevel === level
                            ? 'bg-blue-600 text-white'
                            : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Relevance Score */}
                <div>
                  <label htmlFor="relevance" className="block text-sm font-medium text-stone-300 mb-2">
                    Relevance Score: {(relevanceScore * 100).toFixed(0)}%
                  </label>
                  <input
                    id="relevance"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={relevanceScore}
                    onChange={(e) => setRelevanceScore(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Analyst Notes */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-stone-300 mb-2">
                    Analyst Notes (Optional)
                  </label>
                  <textarea
                    id="notes"
                    value={analystNotes}
                    onChange={(e) => setAnalystNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                    placeholder="Add any relevant notes or context..."
                  />
                </div>

                {/* Submit */}
                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !selectedRecord}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Linking...' : 'Link Record'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

