import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FeedCollectionList } from './FeedCollectionList';
import { FeedCollectionForm } from './FeedCollectionForm';
import { FeedCollectionView } from './FeedCollectionView';
import type { FeedCollection } from '../../types';

type ViewMode = 'list' | 'create' | 'edit' | 'view';

export function FeedManagementPage() {
  const { state } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedCollection, setSelectedCollection] = useState<FeedCollection | null>(null);

  const handleCreate = () => {
    setSelectedCollection(null);
    setViewMode('create');
  };

  const handleEdit = (collection: FeedCollection) => {
    setSelectedCollection(collection);
    setViewMode('edit');
  };

  const handleView = (collection: FeedCollection) => {
    setSelectedCollection(collection);
    setViewMode('view');
  };

  const handleBack = () => {
    setSelectedCollection(null);
    setViewMode('list');
  };

  const handleSaveComplete = () => {
    setViewMode('list');
    setSelectedCollection(null);
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-stone-100">Feed Collections</h1>
              <p className="mt-2 text-stone-400">
                Create custom digests by grouping sources with sorting and filtering options
              </p>
            </div>
            {viewMode === 'list' && (
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250"
              >
                <Plus size={20} />
                New Collection
              </button>
            )}
          </div>
        </div>

        {viewMode === 'list' && (
          <FeedCollectionList
            collections={state.collections}
            onEdit={handleEdit}
            onView={handleView}
          />
        )}

        {(viewMode === 'create' || viewMode === 'edit') && (
          <FeedCollectionForm
            collection={selectedCollection}
            onBack={handleBack}
            onSave={handleSaveComplete}
          />
        )}

        {viewMode === 'view' && selectedCollection && (
          <FeedCollectionView
            collection={selectedCollection}
            onBack={handleBack}
            onEdit={() => handleEdit(selectedCollection)}
          />
        )}
      </div>
    </div>
  );
}

