import { useState, useEffect, useCallback, useRef } from 'react';
import { Filter, RefreshCw, AlertCircle, Clock, CheckCircle, Eye, HelpCircle, Save } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { scanService, scanSessionsService } from '../../services';
import { EmptyState } from '../UI/EmptyState';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { ScanItem } from './ScanItem';
import { ScanSidebar } from './ScanSidebar';
import { QuickActionsPanel } from './QuickActionsPanel';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { QuickLinkToTopicModal } from './QuickLinkToTopicModal';
import { CreateWatchItemModal } from './CreateWatchItemModal';
import type { WatchItemCategory, ScanStatus } from '../../types/osint';
import type { ScanSession } from '../../services/scanSessions.service';

interface ScanRecord {
  id: string;
  sourceId: string;
  title: string;
  url: string | null;
  content: string | null;
  publishedAt: Date | null;
  ingestedAt: Date;
  scanStatus: ScanStatus;
  reviewedAt: Date | null;
  sourceDomain: WatchItemCategory | null;
  sourceName: string;
  sources: {
    id: string;
    name: string;
    domain: WatchItemCategory | null;
  };
  topic_source_links?: Array<{
    id: string;
    topicId: string;
    osint_topics: {
      id: string;
      name: string;
    };
  }>;
}

export function ScanPage() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  
  // State
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [scanMode, setScanMode] = useState(true); // Show only untriaged
  const [selectedDomain, setSelectedDomain] = useState<WatchItemCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Navigation & Selection
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  
  // Stats
  const [stats, setStats] = useState({
    pendingCount: 0,
    reviewedCount: 0,
    linkedCount: 0,
    dismissedCount: 0,
  });
  
  // Session tracking
  const [sessionStartTime] = useState(new Date());
  const [currentSession, setCurrentSession] = useState<ScanSession | null>(null);
  const [sessionCounters, setSessionCounters] = useState({
    reviewed: 0,
    linked: 0,
    watchItems: 0,
    dismissed: 0,
  });
  const [isSavingSession, setIsSavingSession] = useState(false);
  
  // Modals
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showLinkToTopicModal, setShowLinkToTopicModal] = useState(false);
  const [showCreateWatchItemModal, setShowCreateWatchItemModal] = useState(false);
  
  // Refs
  const recordsListRef = useRef<HTMLDivElement>(null);

  const loadRecords = useCallback(async (showSpinner = true) => {
    if (!currentOrganization) {
      setIsLoading(false);
      return;
    }

    try {
      if (showSpinner) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      const filters: any = {
        organizationId: currentOrganization.id,
        limit: 100,
      };

      // Scan mode: only show pending records
      if (scanMode) {
        filters.scanStatus = 'pending';
      }

      if (selectedDomain) {
        filters.domain = selectedDomain;
      }

      if (searchQuery) {
        filters.search = searchQuery;
      }

      const result = await scanService.getScanRecords(filters);
      setRecords(result.records);
      setStats(result.stats);
      
      // Reset selection if no records
      if (result.records.length === 0) {
        setSelectedRecordIndex(0);
        setExpandedRecordId(null);
      } else if (selectedRecordIndex >= result.records.length) {
        setSelectedRecordIndex(result.records.length - 1);
      }
    } catch (err) {
      console.error('Error loading scan records:', err);
      setError(err instanceof Error ? err.message : 'Failed to load records');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentOrganization?.id, scanMode, selectedDomain, searchQuery, selectedRecordIndex]);

  useEffect(() => {
    if (currentOrganization) {
      loadRecords();
    }
  }, [currentOrganization?.id, scanMode, selectedDomain, searchQuery]);

  // Create scan session when component mounts
  useEffect(() => {
    const createSession = async () => {
      if (!currentOrganization || !user) return;
      
      try {
        const session = await scanSessionsService.create({
          organizationId: currentOrganization.id,
          userId: user.id,
        });
        setCurrentSession(session);
      } catch (err) {
        console.error('Error creating scan session:', err);
      }
    };

    createSession();
  }, [currentOrganization?.id, user?.id]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Don't intercept if modal is open
      if (showKeyboardHelp || showLinkToTopicModal || showCreateWatchItemModal) {
        return;
      }

      switch (e.key) {
        case 'j':
          // Navigate down
          e.preventDefault();
          setSelectedRecordIndex(prev => 
            Math.min(prev + 1, records.length - 1)
          );
          break;
        
        case 'k':
          // Navigate up
          e.preventDefault();
          setSelectedRecordIndex(prev => Math.max(prev - 1, 0));
          break;
        
        case 'Enter':
          // Toggle expand/collapse
          e.preventDefault();
          if (records[selectedRecordIndex]) {
            const recordId = records[selectedRecordIndex].id;
            setExpandedRecordId(prev => prev === recordId ? null : recordId);
          }
          break;
        
        case 't':
          // Link to topic
          e.preventDefault();
          if (records[selectedRecordIndex]) {
            setShowLinkToTopicModal(true);
          }
          break;
        
        case 'w':
          // Create watch item
          e.preventDefault();
          if (records[selectedRecordIndex]) {
            setShowCreateWatchItemModal(true);
          }
          break;
        
        case 'x':
          // Dismiss
          e.preventDefault();
          if (records[selectedRecordIndex]) {
            handleDismiss(records[selectedRecordIndex].id);
          }
          break;
        
        case '?':
          // Show keyboard shortcuts
          e.preventDefault();
          setShowKeyboardHelp(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [records, selectedRecordIndex, showKeyboardHelp, showLinkToTopicModal, showCreateWatchItemModal]);

  // Scroll selected item into view
  useEffect(() => {
    if (recordsListRef.current && records[selectedRecordIndex]) {
      const selectedElement = recordsListRef.current.querySelector(
        `[data-record-index="${selectedRecordIndex}"]`
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [selectedRecordIndex, records]);

  const handleDismiss = async (recordId: string) => {
    try {
      await scanService.dismissRecords([recordId], user?.id);
      setSessionCounters(prev => ({
        ...prev,
        reviewed: prev.reviewed + 1,
        dismissed: prev.dismissed + 1,
      }));
      await loadRecords(false);
    } catch (err) {
      console.error('Error dismissing record:', err);
    }
  };

  const handleLinkToTopic = async (topicId: string) => {
    const record = records[selectedRecordIndex];
    if (!record) return;

    try {
      // This will be handled by the modal component
      await scanService.markAsLinked(record.id, user?.id);
      setSessionCounters(prev => ({
        ...prev,
        reviewed: prev.reviewed + 1,
        linked: prev.linked + 1,
      }));
      setShowLinkToTopicModal(false);
      await loadRecords(false);
    } catch (err) {
      console.error('Error linking to topic:', err);
      throw err;
    }
  };

  const handleCreateWatchItem = async () => {
    setSessionCounters(prev => ({
      ...prev,
      reviewed: prev.reviewed + 1,
      watchItems: prev.watchItems + 1,
    }));
    setShowCreateWatchItemModal(false);
    await loadRecords(false);
  };

  const handleEndSession = async () => {
    if (!currentSession) return;

    const notes = prompt('Add any notes about this scan session (optional):');
    if (notes === null) return; // User cancelled

    setIsSavingSession(true);
    try {
      await scanSessionsService.end(
        currentSession.id,
        {
          itemsReviewed: sessionCounters.reviewed,
          itemsLinkedToTopics: sessionCounters.linked,
          itemsCreatedWatch: sessionCounters.watchItems,
          itemsDismissed: sessionCounters.dismissed,
        },
        notes || undefined
      );
      
      // Create a new session for continued work
      if (currentOrganization && user) {
        const newSession = await scanSessionsService.create({
          organizationId: currentOrganization.id,
          userId: user.id,
        });
        setCurrentSession(newSession);
        setSessionCounters({
          reviewed: 0,
          linked: 0,
          watchItems: 0,
          dismissed: 0,
        });
      }
    } catch (err) {
      console.error('Error ending scan session:', err);
      alert('Failed to save scan session');
    } finally {
      setIsSavingSession(false);
    }
  };

  const sessionDuration = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000 / 60);

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <EmptyState
          icon={<AlertCircle size={64} className="text-stone-600" />}
          title="Authentication Required"
          description="Please log in to access the scan view."
        />
      </div>
    );
  }

  if (!currentOrganization) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <EmptyState
          icon={<AlertCircle size={64} className="text-stone-600" />}
          title="No Organization Selected"
          description="Please select or create an organization to continue."
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-stone-950">
      {/* Header */}
      <div className="flex-none bg-stone-900 border-b border-stone-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-stone-100 flex items-center gap-3">
              <Filter className="text-blue-500" size={28} />
              Environmental Scan
            </h1>
            <button
              onClick={() => setScanMode(!scanMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-250 ${
                scanMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              <Eye className="w-4 h-4 inline mr-1" />
              Scan Mode {scanMode ? 'ON' : 'OFF'}
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Session Stats */}
            <div className="text-sm text-stone-400 flex items-center space-x-4">
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                {sessionDuration}m
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                {sessionCounters.reviewed} reviewed
              </div>
              <div className="text-green-400 font-medium">
                {sessionCounters.linked} linked
              </div>
              <div className="text-blue-400 font-medium">
                {sessionCounters.watchItems} watch
              </div>
            </div>
            
            <button
              onClick={handleEndSession}
              disabled={isSavingSession}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors duration-250 disabled:opacity-50"
              title="End and save this scan session"
            >
              <Save className="w-4 h-4" />
              End Session
            </button>
            
            <button
              onClick={() => setShowKeyboardHelp(true)}
              className="p-2 text-stone-400 hover:text-stone-200 rounded-lg hover:bg-stone-800 transition-colors duration-250"
              title="Keyboard shortcuts (?)"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            
            <button
              onClick={() => loadRecords(false)}
              disabled={isRefreshing}
              className="p-2 text-stone-400 hover:text-stone-200 rounded-lg hover:bg-stone-800 transition-colors duration-250 disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        
        {/* Stats Bar */}
        <div className="mt-3 flex items-center space-x-6 text-sm">
          <div className="flex items-center">
            <span className="text-stone-400">Pending:</span>
            <span className="ml-2 font-semibold text-orange-400">{stats.pendingCount}</span>
          </div>
          <div className="flex items-center">
            <span className="text-stone-400">Reviewed:</span>
            <span className="ml-2 font-semibold text-stone-300">{stats.reviewedCount}</span>
          </div>
          <div className="flex items-center">
            <span className="text-stone-400">Linked:</span>
            <span className="ml-2 font-semibold text-green-400">{stats.linkedCount}</span>
          </div>
          <div className="flex items-center">
            <span className="text-stone-400">Dismissed:</span>
            <span className="ml-2 font-semibold text-stone-500">{stats.dismissedCount}</span>
          </div>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Domain Filters */}
        <ScanSidebar
          selectedDomain={selectedDomain}
          onSelectDomain={setSelectedDomain}
          organizationId={currentOrganization.id}
        />

        {/* Main Panel - Records List */}
        <div className="flex-1 overflow-y-auto bg-stone-950" ref={recordsListRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon={<AlertCircle size={64} className="text-stone-600" />}
                title="Error Loading Records"
                description={error}
              />
            </div>
          ) : records.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon={<CheckCircle size={64} className="text-stone-600" />}
                title={scanMode ? 'All Caught Up!' : 'No Records Found'}
                description={
                  scanMode
                    ? 'No pending records to review.'
                    : 'Try adjusting your filters.'
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-stone-800">
              {records.map((record, index) => (
                <ScanItem
                  key={record.id}
                  record={record}
                  isSelected={index === selectedRecordIndex}
                  isExpanded={expandedRecordId === record.id}
                  dataIndex={index}
                  onSelect={() => setSelectedRecordIndex(index)}
                  onToggleExpand={() => setExpandedRecordId(
                    expandedRecordId === record.id ? null : record.id
                  )}
                  onDismiss={() => handleDismiss(record.id)}
                  onLinkToTopic={() => {
                    setSelectedRecordIndex(index);
                    setShowLinkToTopicModal(true);
                  }}
                  onCreateWatchItem={() => {
                    setSelectedRecordIndex(index);
                    setShowCreateWatchItemModal(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar - Quick Actions */}
        <QuickActionsPanel
          selectedRecord={records[selectedRecordIndex] || null}
          onLinkToTopic={() => setShowLinkToTopicModal(true)}
          onCreateWatchItem={() => setShowCreateWatchItemModal(true)}
          onDismiss={() => records[selectedRecordIndex] && handleDismiss(records[selectedRecordIndex].id)}
        />
      </div>

      {/* Modals */}
      {showKeyboardHelp && (
        <KeyboardShortcutsModal onClose={() => setShowKeyboardHelp(false)} />
      )}

      {showLinkToTopicModal && records[selectedRecordIndex] && (
        <QuickLinkToTopicModal
          record={records[selectedRecordIndex]}
          onClose={() => setShowLinkToTopicModal(false)}
          onLinked={handleLinkToTopic}
        />
      )}

      {showCreateWatchItemModal && records[selectedRecordIndex] && (
        <CreateWatchItemModal
          record={records[selectedRecordIndex]}
          onClose={() => setShowCreateWatchItemModal(false)}
          onCreated={handleCreateWatchItem}
        />
      )}
    </div>
  );
}

