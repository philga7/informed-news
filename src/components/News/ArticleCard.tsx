import React from 'react';
import { ExternalLink, Star, Check, Trash2 } from 'lucide-react';
import type { NewsArticle } from '../../types';
import { useApp } from '../../context/AppContext';

interface ArticleCardProps {
  article: NewsArticle;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { dispatch } = useApp();

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
      year: 'numeric',
    });
  };

  return (
    <article
      className={`bg-stone-900 border border-stone-800 rounded-lg overflow-hidden hover:border-stone-700 transition-all duration-250 shadow-sm hover:shadow-md ${
        article.isRead ? 'opacity-60' : ''
      }`}
    >
      {article.imageUrl && (
        <div className="aspect-video w-full overflow-hidden bg-stone-800">
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

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold text-stone-200 leading-snug flex-1">
            {article.title}
          </h3>
          <button
            onClick={toggleFavorite}
            className={`flex-shrink-0 transition-colors duration-250 ${
              article.isFavorite ? 'text-amber-500' : 'text-stone-500 hover:text-amber-500'
            }`}
          >
            <Star size={20} fill={article.isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        {article.description && (
          <p className="text-stone-400 text-sm mb-4 line-clamp-3">{article.description}</p>
        )}

        <div className="flex items-center justify-between text-xs text-stone-500 mb-4">
          <div className="flex items-center gap-3">
            <span className="font-medium text-stone-400">{article.source}</span>
            <span>{formatDate(article.publishedAt)}</span>
          </div>
          {article.author && <span>{article.author}</span>}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-all duration-250"
          >
            Read Article
            <ExternalLink size={16} />
          </a>
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
        </div>
      </div>
    </article>
  );
}
