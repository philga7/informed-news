import React from 'react';
import type { NewsArticle } from '../../types';
import { ArticleCard } from './ArticleCard';
import { EmptyState } from '../UI/EmptyState';
import { Newspaper } from 'lucide-react';

interface ArticleListProps {
  articles: NewsArticle[];
}

export function ArticleList({ articles }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <EmptyState
        title="No articles found"
        description="Add some news sources and click 'Update News' to fetch articles, or adjust your filters."
        icon={<Newspaper size={64} />}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
}
