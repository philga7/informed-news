import type { NewsArticle } from '../types/index.js';

interface CacheEntry {
  articles: NewsArticle[];
  timestamp: number;
  sourceId: string;
}

class FeedCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes default TTL

  /**
   * Get cached articles for a source
   */
  get(sourceId: string): NewsArticle[] | null {
    const entry = this.cache.get(sourceId);
    if (!entry) {
      return null;
    }

    // Check if cache entry is still valid
    const now = Date.now();
    if (now - entry.timestamp > this.TTL_MS) {
      this.cache.delete(sourceId);
      return null;
    }

    return entry.articles;
  }

  /**
   * Set cached articles for a source
   */
  set(sourceId: string, articles: NewsArticle[]): void {
    this.cache.set(sourceId, {
      articles,
      timestamp: Date.now(),
      sourceId,
    });
  }

  /**
   * Clear cache for a specific source
   */
  clear(sourceId: string): void {
    this.cache.delete(sourceId);
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

export const feedCache = new FeedCache();

