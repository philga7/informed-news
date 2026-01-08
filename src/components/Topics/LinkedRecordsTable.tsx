import { ExternalLink, Trash2, TrendingUp, Edit2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfidenceBadge } from '../UI/ConfidenceBadge';
import { LinkReviewStatusBadge } from './LinkReviewStatusBadge';
import { formatSourceNameWithDomain } from '../../utils/urlUtils';

interface LinkedRecordsTableProps {
  links: Array<{
    id: string;
    relevanceScore: number | null;
    confidenceLevel: string | null;
    reviewStatus?: string;
    assumptions: string | null;
    analystNotes: string | null;
    linkedAt: Date;
    artifactReviewStatus?: {
      total: number;
      reviewed: number;
      allReviewed: boolean;
    };
    source_records: {
      id: string;
      title: string;
      url: string | null;
      publishedAt: Date | null;
      sources: {
        name: string;
        reliability_rating: string;
        scrape_external_url?: boolean;
      };
    } | null;
    source_record_id?: string; // Fallback for broken links
  }>;
  onUnlink: (linkId: string) => void;
  onEdit?: (linkId: string) => void;
}

export function LinkedRecordsTable({ links, onUnlink, onEdit }: LinkedRecordsTableProps) {
  const navigate = useNavigate();

  const handleViewRecord = (recordId: string | undefined) => {
    if (recordId) {
      navigate(`/source-records/${recordId}`);
    }
  };

  const handleUnlink = (e: React.MouseEvent, linkId: string) => {
    e.stopPropagation();
    if (confirm('Unlink this source record from the topic?')) {
      onUnlink(linkId);
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

  const getReliabilityBadgeColor = (rating: string) => {
    switch (rating) {
      case 'HIGH':
        return 'bg-green-900/30 text-green-400';
      case 'MEDIUM':
        return 'bg-yellow-900/30 text-yellow-400';
      case 'LOW':
        return 'bg-orange-900/30 text-orange-400';
      default:
        return 'bg-stone-800 text-stone-400';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-stone-800">
            <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Title</th>
            <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Source</th>
            <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Published</th>
            <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Confidence</th>
            <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Review</th>
            <th className="text-center py-3 px-4 text-stone-400 text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => {
            const isBroken = !link.source_records;
            const recordId = link.source_records?.id || link.source_record_id;
            
            return (
            <tr
              key={link.id}
              className={`border-b border-stone-800 transition-colors duration-250 ${
                isBroken 
                  ? 'bg-yellow-900/10 hover:bg-yellow-900/20' 
                  : 'hover:bg-stone-800/50 cursor-pointer'
              }`}
              onClick={() => !isBroken && handleViewRecord(recordId)}
            >
              <td className="py-4 px-4">
                <div className="flex items-start gap-2">
                  {isBroken && (
                    <AlertTriangle size={18} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {isBroken ? (
                      <div>
                        <p className="text-yellow-400 font-medium line-clamp-2">
                          Source Record Missing
                        </p>
                        <p className="text-yellow-500/70 text-xs mt-1">
                          Record ID: {recordId || 'Unknown'} • Linked: {formatDate(link.linkedAt)}
                        </p>
                        {link.analystNotes && (
                          <p className="text-stone-500 text-sm mt-2 line-clamp-2 italic">
                            Note: {link.analystNotes}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <p className="text-stone-200 font-medium line-clamp-2">
                          {link.source_records?.title || 'Unknown'}
                        </p>
                        {link.analystNotes && (
                          <p className="text-stone-500 text-sm mt-1 line-clamp-1">
                            Note: {link.analystNotes}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {!isBroken && link.source_records?.url && (
                    <a
                      href={link.source_records.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-400 hover:text-blue-300 flex-shrink-0"
                      title="Open source URL"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </td>
              <td className="py-4 px-4">
                {isBroken ? (
                  <span className="text-yellow-500/70 text-sm italic">N/A</span>
                ) : (
                  <div>
                    <p className="text-stone-300 text-sm">
                      {formatSourceNameWithDomain(
                        link.source_records!.sources.name,
                        link.source_records!.url,
                        link.source_records!.sources.scrape_external_url || false
                      )}
                    </p>
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded mt-1 ${getReliabilityBadgeColor(
                        link.source_records!.sources.reliability_rating
                      )}`}
                    >
                      {link.source_records!.sources.reliability_rating}
                    </span>
                  </div>
                )}
              </td>
              <td className="py-4 px-4 text-stone-400 text-sm">
                {isBroken ? (
                  <span className="text-yellow-500/70 italic">N/A</span>
                ) : (
                  formatDate(link.source_records!.publishedAt)
                )}
              </td>
              <td className="py-4 px-4">
                {link.artifactReviewStatus && link.artifactReviewStatus.total > 0 && !link.artifactReviewStatus.allReviewed ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded border border-amber-800/50">
                      {link.artifactReviewStatus.reviewed} of {link.artifactReviewStatus.total} artifacts reviewed
                    </span>
                    <span className="text-xs text-stone-500 italic">
                      Review all artifacts to show confidence
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <ConfidenceBadge
                      level={link.confidenceLevel as 'HIGH' | 'MEDIUM' | 'LOW' | null}
                      assumptions={link.assumptions}
                    />
                    {link.relevanceScore !== null && link.relevanceScore !== undefined && !isNaN(Number(link.relevanceScore)) && (
                      <div className="flex items-center gap-1 text-stone-400 text-xs">
                        <TrendingUp size={12} />
                        <span>{(Number(link.relevanceScore) * 100).toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </td>
              <td className="py-4 px-4">
                {link.artifactReviewStatus && link.artifactReviewStatus.total > 0 && !link.artifactReviewStatus.allReviewed ? (
                  <span className="text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded border border-amber-800/50">
                    Pending artifact review
                  </span>
                ) : (
                  <LinkReviewStatusBadge 
                    status={(link.reviewStatus as any) || 'pending'} 
                    size="sm" 
                  />
                )}
              </td>
              <td className="py-4 px-4">
                <div className="flex items-center justify-center gap-2">
                  {onEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(link.id);
                      }}
                      className="p-2 bg-stone-800 hover:bg-blue-900/30 text-stone-400 hover:text-blue-400 rounded-lg transition-colors duration-250"
                      title="Edit link"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleUnlink(e, link.id)}
                    className="p-2 bg-stone-800 hover:bg-red-900/30 text-stone-400 hover:text-red-400 rounded-lg transition-colors duration-250"
                    title="Unlink record"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

