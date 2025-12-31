import { supabase } from '../utils/supabase';
import type { FeedCollection, FeedSourceConfig } from '../types';

/**
 * Feed Collections Service
 * 
 * Manages user-created collections of news sources
 */

export const collectionsService = {
  /**
   * Get all collections for a user
   */
  async getAll(userId: string): Promise<FeedCollection[]> {
    // Get collections with their source configs
    const { data: collections, error: collectionsError } = await supabase
      .from('feed_collections')
      .select(`
        *,
        feed_source_configs (
          source_id,
          count,
          sort_by,
          ascending
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (collectionsError) throw collectionsError;

    return collections.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      sources: row.feed_source_configs.map((config: any) => ({
        sourceId: config.source_id,
        count: config.count,
        sortBy: config.sort_by,
        ascending: config.ascending,
      })),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  },

  /**
   * Get a single collection by ID
   */
  async getById(id: string): Promise<FeedCollection | null> {
    const { data, error } = await supabase
      .from('feed_collections')
      .select(`
        *,
        feed_source_configs (
          source_id,
          count,
          sort_by,
          ascending
        )
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
      description: data.description || undefined,
      sources: data.feed_source_configs.map((config: any) => ({
        sourceId: config.source_id,
        count: config.count,
        sortBy: config.sort_by,
        ascending: config.ascending,
      })),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  },

  /**
   * Create a new collection
   */
  async create(
    userId: string,
    collection: Omit<FeedCollection, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<FeedCollection> {
    // 1. Create the collection
    const { data: collectionData, error: collectionError } = await supabase
      .from('feed_collections')
      .insert({
        user_id: userId,
        name: collection.name,
        description: collection.description,
      })
      .select()
      .single();

    if (collectionError) throw collectionError;

    // 2. Create source configs
    if (collection.sources.length > 0) {
      const configs = collection.sources.map(source => ({
        collection_id: collectionData.id,
        source_id: source.sourceId,
        count: source.count,
        sort_by: source.sortBy,
        ascending: source.ascending,
      }));

      const { error: configsError } = await supabase
        .from('feed_source_configs')
        .insert(configs);

      if (configsError) throw configsError;
    }

    return {
      id: collectionData.id,
      name: collectionData.name,
      description: collectionData.description || undefined,
      sources: collection.sources,
      createdAt: new Date(collectionData.created_at),
      updatedAt: new Date(collectionData.updated_at),
    };
  },

  /**
   * Update a collection
   */
  async update(
    id: string,
    updates: Partial<Omit<FeedCollection, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<FeedCollection> {
    // 1. Update collection basic info
    if (updates.name || updates.description !== undefined) {
      const dbUpdates: any = {};
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;

      const { error: updateError } = await supabase
        .from('feed_collections')
        .update(dbUpdates)
        .eq('id', id);

      if (updateError) throw updateError;
    }

    // 2. Update source configs if provided
    if (updates.sources) {
      // Delete existing configs
      const { error: deleteError } = await supabase
        .from('feed_source_configs')
        .delete()
        .eq('collection_id', id);

      if (deleteError) throw deleteError;

      // Insert new configs
      if (updates.sources.length > 0) {
        const configs = updates.sources.map(source => ({
          collection_id: id,
          source_id: source.sourceId,
          count: source.count,
          sort_by: source.sortBy,
          ascending: source.ascending,
        }));

        const { error: insertError } = await supabase
          .from('feed_source_configs')
          .insert(configs);

        if (insertError) throw insertError;
      }
    }

    // 3. Fetch and return updated collection
    const updated = await this.getById(id);
    if (!updated) throw new Error('Collection not found after update');
    return updated;
  },

  /**
   * Delete a collection
   */
  async delete(id: string): Promise<void> {
    // Configs will be cascade deleted by database
    const { error } = await supabase
      .from('feed_collections')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Add a source to a collection
   */
  async addSource(
    collectionId: string,
    sourceConfig: FeedSourceConfig
  ): Promise<void> {
    const { error } = await supabase
      .from('feed_source_configs')
      .insert({
        collection_id: collectionId,
        source_id: sourceConfig.sourceId,
        count: sourceConfig.count,
        sort_by: sourceConfig.sortBy,
        ascending: sourceConfig.ascending,
      });

    if (error) throw error;
  },

  /**
   * Remove a source from a collection
   */
  async removeSource(collectionId: string, sourceId: string): Promise<void> {
    const { error } = await supabase
      .from('feed_source_configs')
      .delete()
      .eq('collection_id', collectionId)
      .eq('source_id', sourceId);

    if (error) throw error;
  },

  /**
   * Update a source config within a collection
   */
  async updateSourceConfig(
    collectionId: string,
    sourceId: string,
    updates: Partial<Omit<FeedSourceConfig, 'sourceId'>>
  ): Promise<void> {
    const dbUpdates: any = {};
    if (updates.count !== undefined) dbUpdates.count = updates.count;
    if (updates.sortBy !== undefined) dbUpdates.sort_by = updates.sortBy;
    if (updates.ascending !== undefined) dbUpdates.ascending = updates.ascending;

    const { error } = await supabase
      .from('feed_source_configs')
      .update(dbUpdates)
      .eq('collection_id', collectionId)
      .eq('source_id', sourceId);

    if (error) throw error;
  },
};

