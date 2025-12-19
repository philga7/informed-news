import React, { useState } from 'react';
import { Star, Check, Trash2 } from 'lucide-react';
import type { NewsArticle } from '../../types';
import { useApp } from '../../context/AppContext';

interface ArticleCardProps {
  article: NewsArticle;
  feedName?: string;
}

export function ArticleCard({ article, feedName }: ArticleCardProps) {
  const { dispatch } = useApp();
  const [showTooltip, setShowTooltip] = useState(false);

  const toggleFavorite = () => {
    dispatch({
      type: 'UPDATE_ARTICLE',
      payload: {
        id: article.id,
        updates: { isFavorite: !article.isFavorite },
      },
    });
  };

  const toggleRead = () => {
    dispatch({
      type: 'UPDATE_ARTICLE',
      payload: {
        id: article.id,
        updates: { isRead: !article.isRead },
      },
    });
  };

  const deleteArticle = () => {
    if (confirm('Are you sure you want to delete this article?')) {
      dispatch({ type: 'DELETE_ARTICLE', payload: article.id });
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <article
      className={`relative bg-stone-900 border border-stone-800 rounded-lg hover:border-stone-700 transition-all duration-250 shadow-sm hover:shadow-md ${
        article.isRead ? 'opacity-60' : ''
      }`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {article.imageUrl && (
        <div className="aspect-video w-full overflow-hidden bg-stone-800 rounded-t-lg">
          <img
            src={article.imageUrl}
            alt={article.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3 mb-2">
          <span className="text-xs text-stone-500 flex-shrink-0 pt-1">
            {formatDate(article.publishedAt)}
          </span>
          <div className="flex-1 min-w-0">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <h3 className="text-lg font-semibold text-stone-200 leading-snug mb-1 hover:text-stone-100 transition-colors duration-250">
                {article.title}
              </h3>
            </a>
            <div className="flex items-center gap-3">
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-stone-400 hover:text-stone-300 transition-colors duration-250 break-all"
              >
                {article.url}
              </a>
              {article.author && (
                <span className="text-xs text-stone-500 flex-shrink-0">{article.author}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={toggleRead}
              className={`px-3 py-2 rounded-lg transition-all duration-250 ${
                article.isRead
                  ? 'bg-stone-700 text-stone-300'
                  : 'bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-300'
              }`}
              title={article.isRead ? 'Mark as unread' : 'Mark as read'}
            >
              <Check size={18} />
            </button>
            <button
              onClick={deleteArticle}
              className="px-3 py-2 bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-red-400 rounded-lg transition-all duration-250"
              title="Delete article"
            >
              <Trash2 size={18} />
            </button>
            <button
              onClick={toggleFavorite}
              className={`transition-colors duration-250 ${
                article.isFavorite ? 'text-amber-500' : 'text-stone-500 hover:text-amber-500'
              }`}
            >
              <Star size={20} fill={article.isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </div>

      {showTooltip && (feedName || article.description) && (
        <div className="absolute top-full left-0 right-0 mt-2 z-10 bg-stone-900 border border-stone-600 rounded-lg p-4 shadow-xl transition-opacity duration-250">
          <div className="space-y-3">
            {feedName && (
              <div className="text-stone-300 font-medium text-sm">{feedName}</div>
            )}
            {article.description && (
              <p className="text-stone-400 text-sm leading-relaxed">{article.description}</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

