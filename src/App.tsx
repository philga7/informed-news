import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { AuthModal } from './components/Auth/AuthModal';
import { Header } from './components/Layout/Header';
import { ArticlesPage } from './components/News/ArticlesPage';
import { SourcesModal } from './components/Sources/SourcesModal';
import { FeedManagementPage } from './components/Feeds/FeedManagementPage';
import { DashboardPage } from './components/Intelligence/DashboardPage';
import { TopicDetailPage } from './components/Intelligence/TopicDetailPage';
import { HistoryPage } from './components/Intelligence/HistoryPage';

function App() {
  const { state } = useApp();
  const [showSourcesModal, setShowSourcesModal] = useState(false);

  if (!state.authentication.isAuthenticated) {
    return <AuthModal isOpen={true} onClose={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <Header
        onOpenSources={() => setShowSourcesModal(true)}
      />

      <Routes>
        <Route path="/" element={<ArticlesPage />} />
        <Route path="/feeds" element={<FeedManagementPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/topic/:id" element={<TopicDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <SourcesModal isOpen={showSourcesModal} onClose={() => setShowSourcesModal(false)} />
    </div>
  );
}

export default App;
