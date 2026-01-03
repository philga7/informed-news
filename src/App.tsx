import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { AuthModal } from './components/Auth/AuthModal';
import { Header } from './components/Layout/Header';
import { TopicsPage } from './components/Topics/TopicsPage';
import { TopicDetailPage } from './components/Topics/TopicDetailPage';
import { SourceRecordsPage } from './components/SourceRecords/SourceRecordsPage';
import { SourceRecordDetailPage } from './components/SourceRecords/SourceRecordDetailPage';
import { SourcesPage } from './components/Sources/SourcesPage';
import { ProfilePage } from './components/Profile/ProfilePage';
import { AnalystDashboard } from './components/Dashboard/AnalystDashboard';
import { WatchListPage } from './components/WatchList/WatchListPage';
import { ScanPage } from './components/Scan/ScanPage';

function App() {
  const { state } = useApp();

  if (!state.authentication.isAuthenticated) {
    return <AuthModal isOpen={true} onClose={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <Header />

      <Routes>
        <Route path="/dashboard" element={<AnalystDashboard />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/watch-list" element={<WatchListPage />} />
        <Route path="/topics" element={<TopicsPage />} />
        <Route path="/topics/:id" element={<TopicDetailPage />} />
        <Route path="/source-records" element={<SourceRecordsPage />} />
        <Route path="/source-records/:id" element={<SourceRecordDetailPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}

export default App;
