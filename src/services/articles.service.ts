import { supabase } from '../utils/supabase';
import type { NewsArticle } from '../types';

/**
 * News Articles Service
 * 
 * Manages news articles from various sources
 */

export const articlesService = {
  /**
   * Get all articles for a user
   */
  async getAll(userId: string, limit?: number): Promise<NewsArticle[]> {
    let query = supabase
      .from('news_articles')
      .select('*')
      .eq('user_id', userId)
      .order('published_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      url: row.url,
      imageUrl: row.image_url || undefined,
      author: row.author || undefined,
      content: row.content || undefined,
      publishedAt: new Date(row.published_at),
      source: row.source_id, // Will need to join with sources to get name
      sourceId: row.source_id,
      isRead: row.is_read,
      isFavorite: row.is_favorite,
      fetchedAt: new Date(row.fetched_at),
    }));
  },

  /**
   * Get recent articles with optional filtering
   */
  async getRecent(
    userId: string,
    options?: {
      limit?: number;
      sourceId?: string;
      favoritesOnly?: boolean;
      unreadOnly?: boolean;
    }
  ): Promise<NewsArticle[]> {
    let query = supabase
      .from('news_articles')
      .select('*, news_sources(name)')
      .eq('user_id', userId);

    if (options?.sourceId) {
      query = query.eq('source_id', options.sourceId);
    }

    if (options?.favoritesOnly) {
      query = query.eq('is_favorite', true);
    }

    if (options?.unreadOnly) {
      query = query.eq('is_read', false);
    }

    query = query.order('published_at', { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      url: row.url,
      imageUrl: row.image_url || undefined,
      author: row.author || undefined,
      content: row.content || undefined,
      publishedAt: new Date(row.published_at),
      source: row.news_sources?.name || 'Unknown',
      sourceId: row.source_id,
      isRead: row.is_read,
      isFavorite: row.is_favorite,
      fetchedAt: new Date(row.fetched_at),
    }));
  },

  /**
   * Search articles by text
   */
  async search(userId: string, query: string, limit: number = 50): Promise<NewsArticle[]> {
    const { data, error } = await supabase.rpc('search_articles', {
      p_user_id: userId,
      p_search_query: query,
      p_limit: limit,
      p_offset: 0,
    });

    if (error) throw error;

    return data.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      url: row.url,
      imageUrl: undefined,
      author: undefined,
      content: undefined,
      publishedAt: new Date(row.published_at),
      source: row.source_name,
      sourceId: row.source_id,
      isRead: false,
      isFavorite: false,
      fetchedAt: new Date(),
    }));
  },

  /**
   * Create/insert a single article
   */
  async create(userId: string, article: Omit<NewsArticle, 'id' | 'fetchedAt'>): Promise<NewsArticle> {
    const { data, error } = await supabase
      .from('news_articles')
      .insert({
        user_id: userId,
        source_id: article.sourceId,
        title: article.title,
        description: article.description,
        url: article.url,
        image_url: article.imageUrl,
        author: article.author,
        content: article.content,
        published_at: article.publishedAt.toISOString(),
        is_read: article.isRead,
        is_favorite: article.isFavorite,
      })
      .select()
      .single();

    if (error) {
      // Handle duplicate URL gracefully
      if (error.code === '23505') {
        throw new Error('Article already exists');
      }
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      description: data.description,
      url: data.url,
      imageUrl: data.image_url || undefined,
      author: data.author || undefined,
      content: data.content || undefined,
      publishedAt: new Date(data.published_at),
      source: article.source,
      sourceId: data.source_id,
      isRead: data.is_read,
      isFavorite: data.is_favorite,
      fetchedAt: new Date(data.fetched_at),
    };
  },

  /**
   * Bulk insert articles (for feed updates)
   * Uses upsert to handle duplicates gracefully
   * Returns articles with actual Supabase-generated UUIDs
   */
  async bulkInsert(userId: string, articles: Omit<NewsArticle, 'id' | 'fetchedAt'>[]): Promise<NewsArticle[]> {
    if (articles.length === 0) return [];

    const rows = articles.map(article => ({
      user_id: userId,
      source_id: article.sourceId,
      title: article.title,
      description: article.description,
      url: article.url,
      image_url: article.imageUrl,
      author: article.author,
      content: article.content,
      published_at: article.publishedAt.toISOString(),
      is_read: article.isRead,
      is_favorite: article.isFavorite,
    }));

    // Use upsert with onConflict to handle duplicate URLs
    // This will update existing articles and insert new ones
    const { data, error } = await supabase
      .from('news_articles')
      .upsert(rows, {
        onConflict: 'user_id,url', // Unique constraint on user_id + url
        ignoreDuplicates: false,   // Update existing articles
      })
      .select();

    if (error) {
      console.error('Bulk insert error:', error);
      return [];
    }

    // Convert database format to app format with REAL UUIDs
    return (data || []).map((row: any) => ({
      id: row.id, // ← REAL UUID from Supabase
      title: row.title,
      description: row.description,
      url: row.url,
      imageUrl: row.image_url || undefined,
      author: row.author || undefined,
      content: row.content || undefined,
      publishedAt: new Date(row.published_at),
      source: '', // Will be filled from source lookup
      sourceId: row.source_id,
      isRead: row.is_read,
      isFavorite: row.is_favorite,
      fetchedAt: new Date(row.fetched_at),
    }));
  },

  /**
   * Update article (typically for read/favorite status)
   */
  async update(id: string, updates: Partial<NewsArticle>): Promise<NewsArticle> {
    const dbUpdates: any = {};

    if (updates.isRead !== undefined) dbUpdates.is_read = updates.isRead;
    if (updates.isFavorite !== undefined) dbUpdates.is_favorite = updates.isFavorite;

    const { data, error } = await supabase
      .from('news_articles')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      title: data.title,
      description: data.description,
      url: data.url,
      imageUrl: data.image_url || undefined,
      author: data.author || undefined,
      content: data.content || undefined,
      publishedAt: new Date(data.published_at),
      source: '', // Would need join to get name
      sourceId: data.source_id,
      isRead: data.is_read,
      isFavorite: data.is_favorite,
      fetchedAt: new Date(data.fetched_at),
    };
  },

  /**
   * Mark article as read/unread
   */
  async markRead(id: string, isRead: boolean): Promise<void> {
    await this.update(id, { isRead });
  },

  /**
   * Toggle article favorite status
   */
  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    await this.update(id, { isFavorite });
  },

  /**
   * Delete an article
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('news_articles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Clear all articles for a user
   */
  async clearAll(userId: string): Promise<void> {
    const { error } = await supabase
      .from('news_articles')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  },
};

