import type { NewsArticle, FeedCollection, FeedSourceConfig } from '../types';

interface AggregatedSection {
  sourceConfig: FeedSourceConfig;
  sourceName: string;
  articles: NewsArticle[];
}

export interface AggregatedFeed {
  collection: FeedCollection;
  sections: AggregatedSection[];
  totalArticles: number;
}

/**
 * Aggregates articles for a feed collection based on its source configurations
 */
export function aggregateFeedCollection(
  collection: FeedCollection,
  allArticles: NewsArticle[],
  sources: Array<{ id: string; name: string }>
): AggregatedFeed {
  const sections: AggregatedSection[] = [];
  let totalArticles = 0;

  for (const sourceConfig of collection.sources) {
    // Find the source name
    const source = sources.find((s) => s.id === sourceConfig.sourceId);
    if (!source) continue;

    // Filter articles for this source
    let sourceArticles = allArticles.filter(
      (article) => article.sourceId === sourceConfig.sourceId
    );

    // Sort articles based on configuration
    sourceArticles = sortArticles(sourceArticles, sourceConfig.sortBy, sourceConfig.ascending);

    // Limit to the configured count
    sourceArticles = sourceArticles.slice(0, sourceConfig.count);

    sections.push({
      sourceConfig,
      sourceName: source.name,
      articles: sourceArticles,
    });

    totalArticles += sourceArticles.length;
  }

  return {
    collection,
    sections,
    totalArticles,
  };
}

/**
 * Sort articles based on the specified field and order
 */
function sortArticles(
  articles: NewsArticle[],
  sortBy: 'date' | 'title',
  ascending: boolean
): NewsArticle[] {
  const sorted = [...articles];

  sorted.sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'date') {
      comparison = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    } else if (sortBy === 'title') {
      comparison = a.title.localeCompare(b.title);
    }

    return ascending ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Get all articles from a collection (flattened, no sections)
 */
export function getFlattenedCollectionArticles(
  collection: FeedCollection,
  allArticles: NewsArticle[]
): NewsArticle[] {
  const aggregated = aggregateFeedCollection(collection, allArticles, []);
  return aggregated.sections.flatMap((section) => section.articles);
}

