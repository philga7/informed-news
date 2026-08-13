import { useState, useEffect } from 'react';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOrganization } from '../../context/OrganizationContext';
import { indicatorsService } from '../../services';
import type { Indicator } from '../../types/osint';

export function TriggeredIndicatorsBanner() {
  const { currentOrganization } = useOrganization();
  const [triggeredIndicators, setTriggeredIndicators] = useState<Indicator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const loadTriggeredIndicators = async () => {
      if (!currentOrganization) {
        setIsLoading(false);
        return;
      }

      try {
        const indicators = await indicatorsService.getTriggered(currentOrganization.id);
        setTriggeredIndicators(indicators);
      } catch (err) {
        console.error('Error loading triggered indicators:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadTriggeredIndicators();
    
    // Refresh every 5 minutes
    const interval = setInterval(loadTriggeredIndicators, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [currentOrganization?.id]);

  // Don't show if loading, no indicators, or dismissed
  if (isLoading || triggeredIndicators.length === 0 || isDismissed) {
    return null;
  }

  return (
    <div className="bg-amber-900/30 border-b border-amber-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-sm text-amber-200">
                <span className="font-semibold">
                  {triggeredIndicators.length} {triggeredIndicators.length === 1 ? 'Indicator' : 'Indicators'} Triggered
                </span>
                {' '}- {triggeredIndicators.map(i => i.name).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/indicators"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg transition-colors"
            >
              View Indicators
              <ExternalLink size={14} />
            </Link>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1.5 text-amber-400 hover:text-amber-300 transition-colors"
              title="Dismiss banner"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

