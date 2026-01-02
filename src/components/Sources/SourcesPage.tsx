import { Database } from 'lucide-react';
import { AddSourceForm } from './AddSourceForm';
import { SourceManager } from './SourceManager';

export function SourcesPage() {
  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
            <Database className="text-blue-500" size={32} />
            Manage Sources
          </h1>
          <p className="mt-2 text-stone-400">
            Configure and manage your OSINT data sources
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8">
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-stone-200 mb-6">Add New Source</h2>
            <AddSourceForm />
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-stone-200 mb-6">Your Sources</h2>
            <SourceManager />
          </div>
        </div>
      </div>
    </div>
  );
}

