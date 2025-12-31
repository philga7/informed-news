import { supabase } from '../utils/supabase';
import type { Topic } from '../types';

/**
 * Topics Service
 * 
 * Manages AI-extracted topics and their relationships with articles
 */

export const topicsService = {
  /**
   * Get all topics for a user
   */
  async getAll(userId: string): Promise<Topic[]> {
    const { data, error } = await supabase
      .from('topics')
      .select(`
        *,
        topic_articles (article_id)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      keywords: row.keywords || [],
      articleIds: row.topic_articles?.map((ta: any) => ta.article_id) || [],
      followed: row.followed || false,
      tags: row.tags || [],
      status: row.status || 'active',
      potentialRelevanceScore: row.potential_relevance_score || undefined,
      expiryDate: row.expiry_date ? new Date(row.expiry_date) : undefined,
      archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  },

  /**
   * Get trending topics (most articles in last N days)
   */
  async getTrending(userId: string, days: number = 7, limit: number = 10): Promise<Topic[]> {
    // For now, get topics created in last N days with most articles
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('topics')
      .select(`
        *,
        topic_articles (article_id)
      `)
      .eq('user_id', userId)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      keywords: row.keywords || [],
      articleIds: row.topic_articles?.map((ta: any) => ta.article_id) || [],
      followed: row.followed || false,
      tags: row.tags || [],
      status: row.status || 'active',
      potentialRelevanceScore: row.potential_relevance_score || undefined,
      expiryDate: row.expiry_date ? new Date(row.expiry_date) : undefined,
      archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  },

  /**
   * Get a single topic by ID
   */
  async getById(id: string): Promise<Topic | null> {
    const { data, error } = await supabase
      .from('topics')
      .select(`
        *,
        topic_articles (article_id)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      keywords: data.keywords || [],
      articleIds: data.topic_articles?.map((ta: any) => ta.article_id) || [],
      followed: data.followed || false,
      tags: data.tags || [],
      status: data.status || 'active',
      potentialRelevanceScore: data.potential_relevance_score || undefined,
      expiryDate: data.expiry_date ? new Date(data.expiry_date) : undefined,
      archivedAt: data.archived_at ? new Date(data.archived_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  },

  /**
   * Get articles for a topic
   */
  async getArticles(topicId: string, limit?: number): Promise<string[]> {
    let query = supabase
      .from('topic_articles')
      .select('article_id')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data.map(row => row.article_id);
  },

  /**
   * Create or update a topic
   */
  async upsert(
    userId: string,
    topic: Omit<Topic, 'id' | 'articleIds' | 'createdAt' | 'updatedAt'>
  ): Promise<Topic> {
    const { data, error } = await supabase
      .from('topics')
      .upsert({
        user_id: userId,
        name: topic.name,
        keywords: topic.keywords || [],
        followed: topic.followed || false,
        tags: topic.tags || [],
        status: topic.status || 'active',
        potential_relevance_score: topic.potentialRelevanceScore,
        expiry_date: topic.expiryDate?.toISOString(),
        archived_at: topic.archivedAt?.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      keywords: data.keywords || [],
      articleIds: [],
      followed: data.followed || false,
      tags: data.tags || [],
      status: data.status || 'active',
      potentialRelevanceScore: data.potential_relevance_score || undefined,
      expiryDate: data.expiry_date ? new Date(data.expiry_date) : undefined,
      archivedAt: data.archived_at ? new Date(data.archived_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  },

  /**
   * Link a topic to an article
   */
  async linkArticle(topicId: string, articleId: string): Promise<void> {
    const { error } = await supabase
      .from('topic_articles')
      .insert({
        topic_id: topicId,
        article_id: articleId,
      });

    // Ignore duplicate key errors
    if (error && error.code !== '23505') {
      throw error;
    }
  },

  /**
   * Unlink a topic from an article
   */
  async unlinkArticle(topicId: string, articleId: string): Promise<void> {
    const { error } = await supabase
      .from('topic_articles')
      .delete()
      .eq('topic_id', topicId)
      .eq('article_id', articleId);

    if (error) throw error;
  },

  /**
   * Find or create topic by name
   */
  async findOrCreate(
    userId: string,
    topicName: string,
    keywords: string[] = [],
    tags: string[] = []
  ): Promise<Topic> {
    // Try to find existing
    const { data: existing, error: searchError } = await supabase
      .from('topics')
      .select('*')
      .eq('user_id', userId)
      .eq('name', topicName)
      .maybeSingle();

    if (searchError) throw searchError;

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        keywords: existing.keywords || [],
        articleIds: [],
        followed: existing.followed || false,
        tags: existing.tags || [],
        status: existing.status || 'active',
        potentialRelevanceScore: existing.potential_relevance_score || undefined,
        expiryDate: existing.expiry_date ? new Date(existing.expiry_date) : undefined,
        archivedAt: existing.archived_at ? new Date(existing.archived_at) : undefined,
        createdAt: new Date(existing.created_at),
        updatedAt: new Date(existing.updated_at),
      };
    }

    // Create new
    return this.upsert(userId, {
      name: topicName,
      keywords,
      followed: false,
      tags,
      status: 'active',
    });
  },

  /**
   * Delete a topic
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('topics')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Get ignored topics for a user
   */
  async getIgnored(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('ignored_topics')
      .select('topic_id')
      .eq('user_id', userId);

    if (error) throw error;

    return data.map(row => row.topic_id);
  },

  /**
   * Ignore a topic
   */
  async ignore(userId: string, topicId: string): Promise<void> {
    const { error } = await supabase
      .from('ignored_topics')
      .insert({
        user_id: userId,
        topic_id: topicId,
      });

    // Ignore duplicate key errors
    if (error && error.code !== '23505') {
      throw error;
    }
  },

  /**
   * Unignore a topic
   */
  async unignore(userId: string, topicId: string): Promise<void> {
    const { error } = await supabase
      .from('ignored_topics')
      .delete()
      .eq('user_id', userId)
      .eq('topic_id', topicId);

    if (error) throw error;
  },

  /**
   * Ignore an article under a specific topic
   */
  async ignoreArticle(userId: string, topicId: string, articleId: string): Promise<void> {
    const { error } = await supabase
      .from('ignored_topic_articles')
      .insert({
        user_id: userId,
        topic_id: topicId,
        article_id: articleId,
      });

    // Ignore duplicate key errors
    if (error && error.code !== '23505') {
      throw error;
    }
  },

  /**
   * Get ignored articles for a topic
   */
  async getIgnoredArticles(userId: string, topicId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('ignored_topic_articles')
      .select('article_id')
      .eq('user_id', userId)
      .eq('topic_id', topicId);

    if (error) throw error;

    return data.map(row => row.article_id);
  },
};
