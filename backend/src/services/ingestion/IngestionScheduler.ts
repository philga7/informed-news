/**
 * Ingestion Scheduler
 * 
 * Schedules automatic ingestion from RSS sources in the OSINT schema.
 * Replaces the old FeedScheduler with database-backed source management.
 */

import * as cron from 'node-cron';
import { supabase } from '../../utils/supabase.js';
import { IngestionController } from './IngestionController.js';
import { RssIngestionService } from './RssIngestionService.js';
import type { IngestionResult } from '../../types/ingestion.js';

interface SchedulerConfig {
  organizationId: string;
  schedule?: string; // Cron expression
}

type IngestionCallback = (result: IngestionResult, sourceId: string) => void | Promise<void>;

class IngestionScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private callbacks: Map<string, IngestionCallback> = new Map();

  /**
   * Schedule automatic ingestion for all RSS sources in an organization
   * @param config Scheduler configuration
   */
  async scheduleForOrganization(config: SchedulerConfig): Promise<void> {
    const { organizationId, schedule = '*/15 * * * *' } = config;

    // Clear existing task for this organization if any
    this.clearOrganization(organizationId);

    // Fetch all RSS sources for this organization
    const { data: sources, error } = await supabase
      .from('sources')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('source_type', 'rss');

    if (error) {
      console.error(`Failed to fetch sources for organization ${organizationId}:`, error);
      return;
    }

    if (!sources || sources.length === 0) {
      console.log(`No RSS sources found for organization ${organizationId}`);
      return;
    }

    // Schedule the task
    const task = cron.schedule(schedule, async () => {
      await this.runIngestionForOrganization(organizationId);
    });

    this.tasks.set(organizationId, task);
    console.log(`✅ Scheduled ingestion for organization ${organizationId}: ${sources.length} RSS sources, schedule: ${schedule}`);
  }

  /**
   * Run ingestion for all RSS sources in an organization
   */
  private async runIngestionForOrganization(organizationId: string): Promise<void> {
    try {
      console.log(`🔄 Running scheduled ingestion for organization ${organizationId}...`);

      // Fetch all RSS sources for this organization
      const { data: sources, error } = await supabase
        .from('sources')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('source_type', 'rss');

      if (error || !sources || sources.length === 0) {
        console.log(`No RSS sources to ingest for organization ${organizationId}`);
        return;
      }

      // Process each source
      const results = await Promise.allSettled(
        sources.map(async (source) => {
          if (!source.url) {
            console.warn(`Source ${source.id} (${source.name}) has no URL, skipping`);
            return null;
          }

          try {
            // Create RSS ingestion service
            const rssService = new RssIngestionService({
              sourceId: source.id,
              feedUrl: source.url,
              scrapeExternalUrl: false, // TODO: Add this field to sources table
            });

            // Create controller and ingest
            const controller = new IngestionController(rssService);
            const result = await controller.ingest();

            // Log stats
            console.log(`  📰 ${source.name}: +${result.added} new, ~${result.skipped} duplicates, ❌${result.errors.length} errors`);

            // Update source timestamp
            await supabase
              .from('sources')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', source.id);

            // Call callback if registered
            const callback = this.callbacks.get(organizationId);
            if (callback) {
              await callback(result, source.id);
            }

            return result;
          } catch (err) {
            console.error(`  ❌ Error ingesting from ${source.name}:`, err);
            return null;
          }
        })
      );

      // Summarize results
      const successful = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
      console.log(`✅ Ingestion complete: ${successful}/${sources.length} sources processed successfully`);
    } catch (err) {
      console.error(`Error in scheduled ingestion for organization ${organizationId}:`, err);
    }
  }

  /**
   * Register a callback for ingestion events
   */
  setCallback(organizationId: string, callback: IngestionCallback): void {
    this.callbacks.set(organizationId, callback);
  }

  /**
   * Clear scheduler for a specific organization
   */
  clearOrganization(organizationId: string): void {
    const task = this.tasks.get(organizationId);
    if (task) {
      task.stop();
      this.tasks.delete(organizationId);
    }
    this.callbacks.delete(organizationId);
  }

  /**
   * Clear all scheduled tasks
   */
  clearAll(): void {
    this.tasks.forEach((task) => task.stop());
    this.tasks.clear();
    this.callbacks.clear();
  }

  /**
   * Get active schedule count
   */
  getActiveScheduleCount(): number {
    return this.tasks.size;
  }

  /**
   * Get list of scheduled organizations
   */
  getScheduledOrganizations(): string[] {
    return Array.from(this.tasks.keys());
  }
}

export const ingestionScheduler = new IngestionScheduler();

