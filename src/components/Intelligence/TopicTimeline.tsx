import type { NewsArticle } from '../../types';
import { format } from 'date-fns';

interface TopicTimelineProps {
  articles: NewsArticle[];
}

export function TopicTimeline({ articles }: TopicTimelineProps) {
  // Sort articles by publication date
  const sortedArticles = [...articles].sort(
    (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
  );

  if (sortedArticles.length === 0) {
    return (
      <div className="text-center py-8 text-stone-500">
        <p>No articles to display in timeline</p>
      </div>
    );
  }

  const formatDate = (date: Date) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const formatTime = (date: Date) => {
    return format(new Date(date), 'h:mm a');
  };

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-stone-700"></div>

      <div className="space-y-6">
        {sortedArticles.map((article) => (
          <div key={article.id} className="relative flex gap-4">
            {/* Timeline dot */}
            <div className="relative z-10 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-blue-600 border-4 border-stone-950 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white"></div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 pb-6">
              <div className="bg-stone-900 border border-stone-800 rounded-lg p-4 hover:border-stone-700 transition-colors duration-250">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <h3 className="text-lg font-semibold text-stone-200 group-hover:text-stone-100 transition-colors duration-250 mb-1">
                        {article.title}
                      </h3>
                    </a>
                    {article.description && (
                      <p className="text-stone-400 text-sm line-clamp-2 mb-2">
                        {article.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-stone-500">
                  <span>{formatDate(article.publishedAt)}</span>
                  <span>{formatTime(article.publishedAt)}</span>
                  <span className="text-stone-600">•</span>
                  <span>{article.source}</span>
                  {article.author && (
                    <>
                      <span className="text-stone-600">•</span>
                      <span>{article.author}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

