/**
 * Audit History Tab Component
 * 
 * Displays audit trail for topics and other entities.
 * Shows chronological list of actions with expandable before/after states.
 */

import { useState, useEffect } from 'react';
import { Clock, User, ChevronDown, ChevronRight } from 'lucide-react';
import { auditLogService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import type { AuditLogEntry } from '../../types/osint';

interface AuditHistoryTabProps {
  entityType: 'topic' | 'source_record' | 'link' | 'source';
  entityId: string;
}

export function AuditHistoryTab({ entityType, entityId }: AuditHistoryTabProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadHistory();
  }, [entityType, entityId]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let result;
      switch (entityType) {
        case 'topic':
          result = await auditLogService.getTopicHistory(entityId);
          break;
        case 'source_record':
          result = await auditLogService.getSourceRecordHistory(entityId);
          break;
        case 'link':
          result = await auditLogService.getLinkHistory(entityId);
          break;
        case 'source':
          result = await auditLogService.getSourceHistory(entityId);
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      setLogs(result.logs);
    } catch (err) {
      console.error('Error loading audit history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audit history');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpanded = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const formatAction = (action: string): string => {
    return action
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatTimestamp = (date: Date): string => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getUserDisplay = (userId: string | null): string => {
    if (!userId) return 'System';
    if (userId.startsWith('system:')) return userId.replace('system:', '').toUpperCase();
    // In future: look up actual user name
    return userId;
  };

  const renderStateDiff = (log: AuditLogEntry) => {
    if (!log.beforeState && !log.afterState) return null;

    return (
      <div className="mt-2 pl-6 text-sm">
        {log.beforeState && (
          <div className="mb-2">
            <div className="text-stone-500 font-medium mb-1">Before:</div>
            <pre className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-400 overflow-x-auto">
              {JSON.stringify(log.beforeState, null, 2)}
            </pre>
          </div>
        )}
        {log.afterState && (
          <div>
            <div className="text-stone-500 font-medium mb-1">After:</div>
            <pre className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-400 overflow-x-auto">
              {JSON.stringify(log.afterState, null, 2)}
            </pre>
          </div>
        )}
        {log.metadata && Object.keys(log.metadata).length > 0 && (
          <div className="mt-2">
            <div className="text-stone-500 font-medium mb-1">Metadata:</div>
            <pre className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-400 overflow-x-auto">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">{error}</p>
        <button
          onClick={loadHistory}
          className="mt-4 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded transition-colors duration-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500">No audit history available for this {entityType}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const isExpanded = expandedLogs.has(log.id);
        const hasDetails = log.beforeState || log.afterState || (log.metadata && Object.keys(log.metadata).length > 0);

        return (
          <div
            key={log.id}
            className="bg-stone-800 border border-stone-700 rounded-lg p-4 hover:border-stone-600 transition-colors duration-200"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-1 bg-stone-900 text-stone-300 text-xs rounded font-medium">
                    {formatAction(log.action)}
                  </span>
                  <div className="flex items-center gap-1 text-stone-500 text-sm">
                    <Clock size={14} />
                    <span>{formatTimestamp(log.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-stone-500 text-sm">
                    <User size={14} />
                    <span>{getUserDisplay(log.userId)}</span>
                  </div>
                </div>
              </div>
              {hasDetails && (
                <button
                  onClick={() => toggleExpanded(log.id)}
                  className="flex items-center gap-1 text-stone-400 hover:text-stone-300 text-sm transition-colors duration-200"
                >
                  {isExpanded ? (
                    <>
                      <ChevronDown size={16} />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronRight size={16} />
                      Show Details
                    </>
                  )}
                </button>
              )}
            </div>
            {isExpanded && hasDetails && renderStateDiff(log)}
          </div>
        );
      })}
    </div>
  );
}

