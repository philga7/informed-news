import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, MoveUp, MoveDown, Loader } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { collectionsService } from '../../services';
import type { FeedCollection, FeedSourceConfig } from '../../types';

interface FeedCollectionFormProps {
  collection: FeedCollection | null;
  onBack: () => void;
  onSave: () => void;
}

export function FeedCollectionForm({ collection, onBack, onSave }: FeedCollectionFormProps) {
  const { state, dispatch } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sources, setSources] = useState<FeedSourceConfig[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (collection) {
      setName(collection.name);
      setDescription(collection.description || '');
      setSources(collection.sources);
    }
  }, [collection]);

  const handleAddSource = () => {
    if (state.sources.length === 0) {
      alert('Please add some news sources first');
      return;
    }

    const availableSources = state.sources.filter(
      (s) => !sources.some((sc) => sc.sourceId === s.id)
    );

    if (availableSources.length === 0) {
      alert('All sources have been added');
      return;
    }

    setSources([
      ...sources,
      {
        sourceId: availableSources[0].id,
        count: 10,
        sortBy: 'date',
        ascending: false,
      },
    ]);
  };

  const handleRemoveSource = (index: number) => {
    setSources(sources.filter((_, i) => i !== index));
  };

  const handleUpdateSource = (index: number, updates: Partial<FeedSourceConfig>) => {
    setSources(sources.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const handleMoveSource = (index: number, direction: 'up' | 'down') => {
    const newSources = [...sources];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSources[index], newSources[targetIndex]] = [newSources[targetIndex], newSources[index]];
    setSources(newSources);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter a collection name');
      return;
    }

    if (sources.length === 0) {
      setError('Please add at least one source');
      return;
    }

    const userId = state.authentication.user?.id;
    if (!userId) {
      setError('You must be logged in to save collections');
      return;
    }

    setIsSubmitting(true);

    try {
      const collectionData = {
        name: name.trim(),
        description: description.trim() || undefined,
        sources,
      };

      let savedCollection: FeedCollection;

      if (collection) {
        // Update existing collection
        savedCollection = await collectionsService.update(collection.id, collectionData);
        dispatch({
          type: 'UPDATE_COLLECTION',
          payload: { id: collection.id, updates: savedCollection },
        });
      } else {
        // Create new collection
        savedCollection = await collectionsService.create(userId, collectionData);
        dispatch({ type: 'ADD_COLLECTION', payload: savedCollection });
      }

      onSave();
    } catch (error: any) {
      console.error('Failed to save collection:', error);
      setError(error.message || 'Failed to save collection. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-stone-400 hover:text-stone-300 mb-6 transition-colors duration-250"
      >
        <ArrowLeft size={20} />
        Back to Collections
      </button>

      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-stone-100 mb-6">
          {collection ? 'Edit Collection' : 'Create New Collection'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-stone-300 mb-2">
              Collection Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Daily Tech Digest"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-stone-300 mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional description of this collection"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-stone-300">Sources *</label>
              <button
                type="button"
                onClick={handleAddSource}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors duration-250"
              >
                <Plus size={16} />
                Add Source
              </button>
            </div>

            {sources.length === 0 ? (
              <div className="bg-stone-800 border border-stone-700 rounded-lg p-4 text-center text-stone-400">
                No sources added yet. Click "Add Source" to get started.
              </div>
            ) : (
              <div className="space-y-3">
                {sources.map((sourceConfig, index) => (
                  <div
                    key={index}
                    className="bg-stone-800 border border-stone-700 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Source</label>
                          <select
                            value={sourceConfig.sourceId}
                            onChange={(e) =>
                              handleUpdateSource(index, { sourceId: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-stone-900 border border-stone-600 rounded text-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {state.sources.map((source) => (
                              <option key={source.id} value={source.id}>
                                {source.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-stone-400 mb-1">
                            Max Articles
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={sourceConfig.count}
                            onChange={(e) =>
                              handleUpdateSource(index, { count: parseInt(e.target.value) || 1 })
                            }
                            className="w-full px-3 py-2 bg-stone-900 border border-stone-600 rounded text-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Sort By</label>
                          <select
                            value={sourceConfig.sortBy}
                            onChange={(e) =>
                              handleUpdateSource(index, {
                                sortBy: e.target.value as 'date' | 'title',
                              })
                            }
                            className="w-full px-3 py-2 bg-stone-900 border border-stone-600 rounded text-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="date">Date</option>
                            <option value="title">Title</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Order</label>
                          <select
                            value={sourceConfig.ascending ? 'asc' : 'desc'}
                            onChange={(e) =>
                              handleUpdateSource(index, { ascending: e.target.value === 'asc' })
                            }
                            className="w-full px-3 py-2 bg-stone-900 border border-stone-600 rounded text-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="desc">Descending</option>
                            <option value="asc">Ascending</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveSource(index, 'up')}
                          disabled={index === 0}
                          className="p-1.5 text-stone-400 hover:text-stone-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <MoveUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSource(index, 'down')}
                          disabled={index === sources.length - 1}
                          className="p-1.5 text-stone-400 hover:text-stone-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <MoveDown size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSource(index)}
                          className="p-1.5 text-stone-400 hover:text-red-400"
                          title="Remove source"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  {collection ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                collection ? 'Update Collection' : 'Create Collection'
              )}
            </button>
            <button
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className="px-6 py-2 bg-stone-800 hover:bg-stone-750 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

