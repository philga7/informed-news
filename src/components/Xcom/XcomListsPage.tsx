/**
 * X.com Lists Page
 * 
 * Placeholder component for Phase 3 navigation structure.
 * Full implementation will be completed in later phases.
 */

import { useNavigate } from 'react-router-dom';
import { Sparkles, User, List } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { LoadingSpinner } from '../UI/LoadingSpinner';

export function XcomListsPage() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();

  if (!currentOrganization) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="text-accent" size={32} />
            <h1 className="text-3xl font-bold text-stone-200">Developing News</h1>
          </div>
          <p className="text-stone-400">
            Manage X.com profile and list timelines for {currentOrganization.name}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-stone-800">
            <nav className="-mb-px flex gap-4" aria-label="Tabs">
              <button
                onClick={() => navigate('/developing-news/xcom-profiles')}
                className={`
                  group inline-flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all
                  border-transparent text-stone-400 hover:text-stone-300 hover:border-stone-700
                `}
              >
                <User
                  size={18}
                  className="text-stone-500 group-hover:text-stone-400"
                />
                <div className="flex flex-col items-start">
                  <span>X.com Profiles</span>
                  <span className="text-xs text-stone-600 group-hover:text-stone-500">
                    Profile timelines
                  </span>
                </div>
              </button>
              <button
                onClick={() => navigate('/developing-news/xcom-lists')}
                className={`
                  group inline-flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all
                  border-accent text-accent
                `}
              >
                <List
                  size={18}
                  className="text-accent"
                />
                <div className="flex flex-col items-start">
                  <span>X.com Lists</span>
                  <span className="text-xs text-accent/70">
                    List timelines
                  </span>
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* Page Content */}
        <div className="pb-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-stone-100 mb-2">X.com Lists</h2>
            <p className="text-stone-400">Manage X.com list timelines</p>
          </div>
          
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-8 text-center">
            <p className="text-stone-400 mb-4">List management UI coming in Phase 6</p>
            <p className="text-sm text-stone-500">Backend API routes and navigation structure are in place.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
