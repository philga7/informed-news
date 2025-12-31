import { supabase } from '../utils/supabase';
import type { NewsSource } from '../types';

/**
 * News Sources Service
 * 
 * Manages news sources (RSS feeds, APIs, manual URLs, scrapers)
 */

export const sourcesService = {
  /**
   * Get all sources for a user
   */
  async getAll(userId: string): Promise<NewsSource[]> {
    const { data, error } = await supabase
      .from('news_sources')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Convert database format to app format
    return data.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      url: row.url,
      enabled: row.enabled,
      scrapeExternalUrl: row.scrape_external_url || false,
      createdAt: new Date(row.created_at),
      lastFetched: row.last_fetched ? new Date(row.last_fetched) : undefined,
      errorMessage: row.error_message || undefined,
    }));
  },

  /**
   * Get a single source by ID
   */
  async getById(id: string): Promise<NewsSource | null> {
    const { data, error } = await supabase
      .from('news_sources')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      type: data.type,
      url: data.url,
      enabled: data.enabled,
      scrapeExternalUrl: data.scrape_external_url || false,
      createdAt: new Date(data.created_at),
      lastFetched: data.last_fetched ? new Date(data.last_fetched) : undefined,
      errorMessage: data.error_message || undefined,
    };
  },

  /**
   * Create a new source
   */
  async create(userId: string, source: Omit<NewsSource, 'id' | 'createdAt'>): Promise<NewsSource> {
    const { data, error } = await supabase
      .from('news_sources')
      .insert({
        user_id: userId,
        name: source.name,
        type: source.type,
        url: source.url,
        enabled: source.enabled,
        scrape_external_url: source.scrapeExternalUrl || false,
        last_fetched: source.lastFetched?.toISOString(),
        error_message: source.errorMessage,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      type: data.type,
      url: data.url,
      enabled: data.enabled,
      scrapeExternalUrl: data.scrape_external_url || false,
      createdAt: new Date(data.created_at),
      lastFetched: data.last_fetched ? new Date(data.last_fetched) : undefined,
      errorMessage: data.error_message || undefined,
    };
  },

  /**
   * Update a source
   */
  async update(id: string, updates: Partial<NewsSource>): Promise<NewsSource> {
    const dbUpdates: any = {};
    
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.url !== undefined) dbUpdates.url = updates.url;
    if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
    if (updates.scrapeExternalUrl !== undefined) dbUpdates.scrape_external_url = updates.scrapeExternalUrl;
    if (updates.lastFetched !== undefined) dbUpdates.last_fetched = updates.lastFetched?.toISOString();
    if (updates.errorMessage !== undefined) dbUpdates.error_message = updates.errorMessage;

    const { data, error } = await supabase
      .from('news_sources')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      type: data.type,
      url: data.url,
      enabled: data.enabled,
      scrapeExternalUrl: data.scrape_external_url || false,
      createdAt: new Date(data.created_at),
      lastFetched: data.last_fetched ? new Date(data.last_fetched) : undefined,
      errorMessage: data.error_message || undefined,
    };
  },

  /**
   * Delete a source
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('news_sources')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Toggle source enabled/disabled
   */
  async toggleEnabled(id: string, enabled: boolean): Promise<NewsSource> {
    return this.update(id, { enabled });
  },

  /**
   * Update last fetched timestamp and error
   */
  async updateFetchStatus(
    id: string,
    lastFetched: Date,
    errorMessage?: string
  ): Promise<NewsSource> {
    return this.update(id, {
      lastFetched,
      errorMessage: errorMessage || undefined,
    });
  },
};

