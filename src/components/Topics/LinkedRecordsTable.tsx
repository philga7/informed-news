import { ExternalLink, Trash2, TrendingUp, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfidenceBadge } from '../UI/ConfidenceBadge';
import { LinkReviewStatusBadge } from './LinkReviewStatusBadge';

interface LinkedRecordsTableProps {
  links: Array<{
    id: string;
    relevanceScore: number | null;
    confidenceLevel: string | null;
    reviewStatus?: string;
    assumptions: string | null;
    analystNotes: string | null;
    linkedAt: Date;
    source_records: {
      id: string;
      title: string;
      url: string | null;
      publishedAt: Date | null;
      sources: {
        name: string;
        reliability_rating: string;
      };
    };
  }>;
  onUnlink: (linkId: string) => void;
  onEdit?: (linkId: string) => void;
}

export function LinkedRecordsTable({ links, onUnlink, onEdit }: LinkedRecordsTableProps) {
  const navigate = useNavigate();

  const handleViewRecord = (recordId: string) => {
    navigate(`/source-records/${recordId}`);
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
          {links.map((link) => (
            <tr
              key={link.id}
              className="border-b border-stone-800 hover:bg-stone-800/50 cursor-pointer transition-colors duration-250"
              onClick={() => handleViewRecord(link.source_records.id)}
            >
              <td className="py-4 px-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-200 font-medium line-clamp-2">
                      {link.source_records.title}
                    </p>
                    {link.analystNotes && (
                      <p className="text-stone-500 text-sm mt-1 line-clamp-1">
                        Note: {link.analystNotes}
                      </p>
                    )}
                  </div>
                  {link.source_records.url && (
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
                <div>
                  <p className="text-stone-300 text-sm">{link.source_records.sources.name}</p>
                  <span
                    className={`inline-block px-2 py-0.5 text-xs rounded mt-1 ${getReliabilityBadgeColor(
                      link.source_records.sources.reliability_rating
                    )}`}
                  >
                    {link.source_records.sources.reliability_rating}
                  </span>
                </div>
              </td>
              <td className="py-4 px-4 text-stone-400 text-sm">
                {formatDate(link.source_records.publishedAt)}
              </td>
              <td className="py-4 px-4">
                <div className="flex flex-col gap-1">
                  <ConfidenceBadge
                    level={link.confidenceLevel as 'HIGH' | 'MEDIUM' | 'LOW' | null}
                    assumptions={link.assumptions}
                  />
                  {link.relevanceScore !== null && (
                    <div className="flex items-center gap-1 text-stone-400 text-xs">
                      <TrendingUp size={12} />
                      <span>{(link.relevanceScore * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              </td>
              <td className="py-4 px-4">
                <LinkReviewStatusBadge 
                  status={(link.reviewStatus as any) || 'pending'} 
                  size="sm" 
                />
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

