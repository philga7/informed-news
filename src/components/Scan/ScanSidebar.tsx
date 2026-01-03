import { useState, useEffect } from 'react';
import { Filter, Loader2 } from 'lucide-react';
import { scanService } from '../../services';
import type { WatchItemCategory } from '../../types/osint';

interface ScanSidebarProps {
  selectedDomain: WatchItemCategory | null;
  onSelectDomain: (domain: WatchItemCategory | null) => void;
  organizationId: string;
}

interface DomainStat {
  domain: WatchItemCategory;
  pendingCount: number;
  totalCount: number;
}

const DOMAIN_LABELS: Record<WatchItemCategory, { label: string; icon: string }> = {
  politics: { label: 'Politics', icon: '🏛️' },
  finance: { label: 'Finance', icon: '💰' },
  technology: { label: 'Technology', icon: '💻' },
  local: { label: 'Local', icon: '📍' },
  international: { label: 'International', icon: '🌍' },
  health: { label: 'Health', icon: '🏥' },
  security: { label: 'Security', icon: '🔒' },
  other: { label: 'Other', icon: '📋' },
};

export function ScanSidebar({ selectedDomain, onSelectDomain, organizationId }: ScanSidebarProps) {
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDomainStats = async () => {
      try {
        setIsLoading(true);
        const stats = await scanService.getDomainStats(organizationId);
        setDomainStats(stats);
      } catch (err) {
        console.error('Error loading domain stats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (organizationId) {
      loadDomainStats();
    }
  }, [organizationId]);

  const totalPending = domainStats.reduce((sum, stat) => sum + stat.pendingCount, 0);

  return (
    <div className="w-64 bg-stone-900 border-r border-stone-800 overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center mb-4">
          <Filter className="w-5 h-5 text-stone-400 mr-2" />
          <h2 className="text-lg font-semibold text-stone-100">Filter by Domain</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-1">
            {/* All Domains */}
            <button
              onClick={() => onSelectDomain(null)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors duration-250 ${
                selectedDomain === null
                  ? 'bg-blue-600 text-white'
                  : 'text-stone-300 hover:bg-stone-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="mr-2">📊</span>
                  <span className="font-medium">All Domains</span>
                </div>
                <span className={`text-sm font-semibold ${
                  selectedDomain === null ? 'text-white' : 'text-stone-400'
                }`}>
                  {totalPending}
                </span>
              </div>
            </button>

            {/* Divider */}
            <div className="my-3 border-t border-stone-800"></div>

            {/* Individual Domains */}
            {domainStats.length === 0 ? (
              <p className="text-sm text-stone-500 text-center py-4">
                No domains with records
              </p>
            ) : (
              domainStats.map((stat) => {
                const domainInfo = DOMAIN_LABELS[stat.domain];
                return (
                  <button
                    key={stat.domain}
                    onClick={() => onSelectDomain(stat.domain)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors duration-250 ${
                      selectedDomain === stat.domain
                        ? 'bg-blue-600 text-white'
                        : 'text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="mr-2">{domainInfo.icon}</span>
                        <span className="font-medium">{domainInfo.label}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm font-semibold ${
                          stat.pendingCount > 0
                            ? 'text-orange-400'
                            : 'text-stone-500'
                        }`}>
                          {stat.pendingCount}
                        </span>
                        <span className="text-xs text-stone-500">
                          / {stat.totalCount}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-stone-800">
          <p className="text-xs text-stone-500 mb-2">Legend:</p>
          <div className="space-y-1 text-xs text-stone-400">
            <div className="flex items-center justify-between">
              <span>Pending</span>
              <span className="font-semibold text-orange-400">●</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Total</span>
              <span className="text-stone-500">/ total</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

