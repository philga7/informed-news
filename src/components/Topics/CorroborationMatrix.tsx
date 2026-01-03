import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, HelpCircle, Minus } from 'lucide-react';
import { claimsService } from '../../services/claims.service';
import type { CorroborationMatrix as CorroborationMatrixType } from '../../types/osint';

interface CorroborationMatrixProps {
  topicId: string;
}

export function CorroborationMatrix({ topicId }: CorroborationMatrixProps) {
  const [matrix, setMatrix] = useState<CorroborationMatrixType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    claimId: string;
    linkId: string;
  } | null>(null);

  useEffect(() => {
    loadMatrix();
  }, [topicId]);

  const loadMatrix = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await claimsService.getCorroborationMatrix(topicId);
      setMatrix(data);
    } catch (err) {
      console.error('Error loading corroboration matrix:', err);
      setError(err instanceof Error ? err.message : 'Failed to load matrix');
    } finally {
      setIsLoading(false);
    }
  };

  const getCell = (claimId: string, linkId: string) => {
    if (!matrix) return null;
    return matrix.matrix.find(
      (cell) => cell.claimId === claimId && cell.linkId === linkId
    );
  };

  const renderCellIndicator = (claimId: string, linkId: string) => {
    const cell = getCell(claimId, linkId);
    
    if (!cell || cell.supports === null) {
      return (
        <div className="w-full h-full flex items-center justify-center text-stone-600">
          <Minus size={16} />
        </div>
      );
    }

    if (cell.supports === true) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-green-900/30 border border-green-800 rounded text-green-400">
          <CheckCircle2 size={16} />
        </div>
      );
    }

    if (cell.supports === false) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-red-900/30 border border-red-800 rounded text-red-400">
          <XCircle size={16} />
        </div>
      );
    }

    return null;
  };

  const getHoveredCellData = () => {
    if (!hoveredCell || !matrix) return null;
    return getCell(hoveredCell.claimId, hoveredCell.linkId);
  };

  if (isLoading) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 text-stone-400">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-stone-400 border-t-transparent" />
          Loading corroboration matrix...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!matrix || matrix.claims.length === 0 || matrix.sources.length === 0) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="text-center py-12">
          <HelpCircle size={48} className="mx-auto text-stone-600 mb-4" />
          <h4 className="text-lg font-medium text-stone-300 mb-2">
            No Matrix Data
          </h4>
          <p className="text-sm text-stone-500">
            Add claims and link sources to see the corroboration matrix
          </p>
        </div>
      </div>
    );
  }

  const hoveredData = getHoveredCellData();

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg">
      {/* Header */}
      <div className="p-6 border-b border-stone-800">
        <h3 className="text-xl font-semibold text-stone-100">
          Corroboration Matrix
        </h3>
        <p className="text-sm text-stone-400 mt-1">
          Visual overview of which sources support, contradict, or mention each claim
        </p>
      </div>

      {/* Legend */}
      <div className="px-6 pt-4 pb-2 border-b border-stone-800">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center bg-green-900/30 border border-green-800 rounded text-green-400">
              <CheckCircle2 size={14} />
            </div>
            <span className="text-stone-400">Corroborates</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center bg-red-900/30 border border-red-800 rounded text-red-400">
              <XCircle size={14} />
            </div>
            <span className="text-stone-400">Contradicts</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-stone-600">
              <Minus size={14} />
            </div>
            <span className="text-stone-400">No Evidence</span>
          </div>
        </div>
      </div>

      {/* Matrix */}
      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-stone-900 p-2 text-left">
                  <div className="text-sm font-medium text-stone-400 min-w-[300px]">
                    Claim
                  </div>
                </th>
                {matrix.sources.map((source) => (
                  <th key={source.linkId} className="p-2">
                    <div className="text-xs font-medium text-stone-400 max-w-[120px] truncate text-center">
                      {source.sourceName}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.claims.map((claim) => (
                <tr key={claim.id} className="border-t border-stone-800">
                  <td className="sticky left-0 z-10 bg-stone-900 p-2">
                    <div className="text-sm text-stone-300 line-clamp-2 min-w-[300px]">
                      {claim.claimText}
                    </div>
                    {claim.claimType && (
                      <div className="text-xs text-stone-500 mt-1 capitalize">
                        {claim.claimType}
                      </div>
                    )}
                  </td>
                  {matrix.sources.map((source) => (
                    <td
                      key={`${claim.id}-${source.linkId}`}
                      className="p-2 border-l border-stone-800"
                      onMouseEnter={() =>
                        setHoveredCell({ claimId: claim.id, linkId: source.linkId })
                      }
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div className="w-12 h-12 mx-auto cursor-pointer hover:scale-110 transition-transform duration-200">
                        {renderCellIndicator(claim.id, source.linkId)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tooltip for hovered cell */}
        {hoveredData && hoveredData.evidenceExcerpt && (
          <div className="mt-4 p-4 bg-stone-800/50 border border-stone-700 rounded-lg">
            <div className="flex items-start gap-2">
              {hoveredData.supports === true && (
                <CheckCircle2 size={16} className="text-green-400 mt-0.5" />
              )}
              {hoveredData.supports === false && (
                <XCircle size={16} className="text-red-400 mt-0.5" />
              )}
              <div>
                <div className="text-sm font-medium text-stone-300 mb-1">
                  Evidence from {hoveredData.sourceName}:
                </div>
                <div className="text-sm text-stone-400 italic">
                  "{hoveredData.evidenceExcerpt}"
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gap Analysis */}
      <div className="p-6 border-t border-stone-800 bg-stone-800/30">
        <h4 className="text-sm font-medium text-stone-300 mb-3">Gap Analysis</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-stone-900/50 border border-stone-700 rounded-lg p-3">
            <div className="text-stone-400 mb-1">Claims Without Evidence</div>
            <div className="text-2xl font-semibold text-stone-200">
              {matrix.claims.filter((claim) => {
                const hasEvidence = matrix.matrix.some(
                  (cell) => cell.claimId === claim.id && cell.supports !== null
                );
                return !hasEvidence;
              }).length}
            </div>
          </div>
          <div className="bg-stone-900/50 border border-stone-700 rounded-lg p-3">
            <div className="text-stone-400 mb-1">Single-Source Claims</div>
            <div className="text-2xl font-semibold text-amber-400">
              {matrix.claims.filter((claim) => {
                const supporting = matrix.matrix.filter(
                  (cell) => cell.claimId === claim.id && cell.supports === true
                ).length;
                return supporting === 1;
              }).length}
            </div>
          </div>
          <div className="bg-stone-900/50 border border-stone-700 rounded-lg p-3">
            <div className="text-stone-400 mb-1">Disputed Claims</div>
            <div className="text-2xl font-semibold text-red-400">
              {matrix.claims.filter((claim) => {
                const contradicting = matrix.matrix.some(
                  (cell) => cell.claimId === claim.id && cell.supports === false
                );
                return contradicting;
              }).length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

