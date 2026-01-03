import { useState } from 'react';
import { BarChart3, Calendar, Clock, TrendingUp } from 'lucide-react';
import { DailyReview } from './DailyReview';
import { WeeklyReview } from './WeeklyReview';
import { MonthlyAudit } from './MonthlyAudit';

type DashboardTab = 'daily' | 'weekly' | 'monthly';

export function AnalystDashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('daily');

  const tabs: Array<{
    id: DashboardTab;
    label: string;
    icon: typeof Clock;
    description: string;
  }> = [
    {
      id: 'daily',
      label: 'Daily Review',
      icon: Clock,
      description: '~15 min quick triage',
    },
    {
      id: 'weekly',
      label: 'Weekly Review',
      icon: Calendar,
      description: 'Quality & corroboration',
    },
    {
      id: 'monthly',
      label: 'Monthly Audit',
      icon: TrendingUp,
      description: 'Strategic reflection',
    },
  ];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="text-accent" size={32} />
            <h1 className="text-3xl font-bold text-stone-200">Analyst Dashboard</h1>
          </div>
          <p className="text-stone-400">
            Structured workflows for daily operations, weekly quality checks, and monthly strategic
            review.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-stone-800">
            <nav className="-mb-px flex gap-4" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      group inline-flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all
                      ${
                        isActive
                          ? 'border-accent text-accent'
                          : 'border-transparent text-stone-400 hover:text-stone-300 hover:border-stone-700'
                      }
                    `}
                  >
                    <Icon
                      size={18}
                      className={`${
                        isActive ? 'text-accent' : 'text-stone-500 group-hover:text-stone-400'
                      }`}
                    />
                    <div className="flex flex-col items-start">
                      <span>{tab.label}</span>
                      <span
                        className={`text-xs ${
                          isActive ? 'text-accent/70' : 'text-stone-600 group-hover:text-stone-500'
                        }`}
                      >
                        {tab.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="pb-8">
          {activeTab === 'daily' && <DailyReview />}
          {activeTab === 'weekly' && <WeeklyReview />}
          {activeTab === 'monthly' && <MonthlyAudit />}
        </div>
      </div>
    </div>
  );
}

