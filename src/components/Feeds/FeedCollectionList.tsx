import { Eye, Edit2, Trash2, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { collectionsService } from '../../services';
import { EmptyState } from '../UI/EmptyState';
import type { FeedCollection } from '../../types';

interface FeedCollectionListProps {
  collections: FeedCollection[];
  onEdit: (collection: FeedCollection) => void;
  onView: (collection: FeedCollection) => void;
}

export function FeedCollectionList({ collections, onEdit, onView }: FeedCollectionListProps) {
  const { dispatch } = useApp();

  const handleDelete = async (collection: FeedCollection) => {
    if (!confirm(`Are you sure you want to delete "${collection.name}"?`)) {
      return;
    }

    try {
      // Delete from Supabase
      await collectionsService.delete(collection.id);
      
      // Update local state
      dispatch({ type: 'DELETE_COLLECTION', payload: collection.id });
    } catch (error: any) {
      console.error('Failed to delete collection:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: 'Failed to delete collection. Please try again.',
      });
    }
  };

  if (collections.length === 0) {
    return (
      <EmptyState
        title="No feed collections"
        description="Create your first collection to organize sources into custom digests."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections.map((collection) => (
        <div
          key={collection.id}
          className="bg-stone-900 border border-stone-800 rounded-lg p-5 hover:border-stone-700 transition-all duration-250"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="text-blue-500" size={20} />
              <h3 className="text-lg font-semibold text-stone-200">{collection.name}</h3>
            </div>
          </div>

          {collection.description && (
            <p className="text-stone-400 text-sm mb-4 line-clamp-2">{collection.description}</p>
          )}

          <div className="flex items-center gap-2 mb-4 text-stone-500 text-sm">
            <span>{collection.sources.length} source{collection.sources.length !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>Updated {new Date(collection.updatedAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onView(collection)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-stone-800 hover:bg-stone-750 text-stone-300 rounded-lg transition-colors duration-250"
              title="View collection"
            >
              <Eye size={16} />
              View
            </button>
            <button
              onClick={() => onEdit(collection)}
              className="px-3 py-2 bg-stone-800 hover:bg-stone-750 text-stone-300 rounded-lg transition-colors duration-250"
              title="Edit collection"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => handleDelete(collection)}
              className="px-3 py-2 bg-stone-800 hover:bg-red-900/30 text-stone-300 hover:text-red-400 rounded-lg transition-colors duration-250"
              title="Delete collection"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

