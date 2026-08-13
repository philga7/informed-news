/**
 * Retention Job Service
 * 
 * Provides execution logic for retention policies across sources and organizations.
 * Scheduling is handled by GitHub Actions.
 */

import { supabase } from '../../utils/supabase.js';
import { RetentionPolicyService, type RetentionPolicy, type RetentionResult } from './RetentionPolicyService.js';

// ============================================================================
// TYPES
// ============================================================================

interface Source {
  id: string;
  name: string;
  organization_id: string;
  retention_max_items: number | null;
  retention_days: number | null;
  retention_action: 'delete' | 'archive';
}

export interface AggregatedRetentionResult extends RetentionResult {
  sourceId: string;
  sourceName: string;
}

// ============================================================================
// RETENTION JOB SERVICE
// ============================================================================

export class RetentionJob {
  private retentionService: RetentionPolicyService;

  constructor() {
    this.retentionService = new RetentionPolicyService();
  }

  /**
   * Run retention for all sources with policies configured in an organization
   */
  async runRetentionForOrganization(organizationId: string): Promise<AggregatedRetentionResult[]> {
    try {
      // Fetch all sources with retention policies configured
      const { data: sources, error } = await supabase
        .from('sources')
        .select('id, name, organization_id, retention_max_items, retention_days, retention_action')
        .eq('organization_id', organizationId)
        .or('retention_max_items.not.is.null,retention_days.not.is.null') as { data: Source[] | null; error: unknown };

      if (error) throw error;
      if (!sources || sources.length === 0) {
        return [];
      }

      const results: AggregatedRetentionResult[] = [];

      // Process sources in batches to avoid long-running transactions
      const batchSize = 10;
      for (let i = 0; i < sources.length; i += batchSize) {
        const batch = sources.slice(i, i + batchSize);
        const batchResults = await this.processBatch(batch);
        results.push(...batchResults);
      }

      return results;
    } catch (err) {
      console.error('[RetentionJob] Error running retention for organization:', err);
      throw err;
    }
  }

  /**
   * Run retention for single source
   */
  async runRetentionForSource(sourceId: string): Promise<AggregatedRetentionResult> {
    try {
      // Fetch source
      const { data: source, error } = await supabase
        .from('sources')
        .select('id, name, organization_id, retention_max_items, retention_days, retention_action')
        .eq('id', sourceId)
        .single() as { data: Source | null; error: unknown };

      if (error) throw error;
      if (!source) throw new Error(`Source ${sourceId} not found`);

      // Check if policy is configured
      if (!source.retention_max_items && !source.retention_days) {
        throw new Error('No retention policy configured for this source');
      }

      const policy: RetentionPolicy = {
        maxItems: source.retention_max_items || undefined,
        retentionDays: source.retention_days || undefined,
        action: source.retention_action || 'archive',
      };

      const result = await this.retentionService.applyRetentionPolicy(sourceId, policy);

      return {
        ...result,
        sourceId: source.id,
        sourceName: source.name,
      };
    } catch (err) {
      console.error('[RetentionJob] Error running retention for source:', err);
      throw err;
    }
  }

  /**
   * Process sources in batches to avoid long-running transactions
   */
  async processBatch(sources: Source[]): Promise<AggregatedRetentionResult[]> {
    const results: AggregatedRetentionResult[] = [];

    for (const source of sources) {
      try {
        // Skip if no policy configured
        if (!source.retention_max_items && !source.retention_days) {
          continue;
        }

        const policy: RetentionPolicy = {
          maxItems: source.retention_max_items || undefined,
          retentionDays: source.retention_days || undefined,
          action: source.retention_action || 'archive',
        };

        const result = await this.retentionService.applyRetentionPolicy(source.id, policy);

        results.push({
          ...result,
          sourceId: source.id,
          sourceName: source.name || 'Unknown',
        });
      } catch (err) {
        console.error(`[RetentionJob] Error processing source ${source.id}:`, err);
        results.push({
          processed: 0,
          archived: 0,
          deleted: 0,
          protected: 0,
          errors: [
            `Failed to process source ${source.id}: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`,
          ],
          sourceId: source.id,
          sourceName: source.name || 'Unknown',
        });
      }
    }

    return results;
  }
}

