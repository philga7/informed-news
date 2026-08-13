import * as cron from 'node-cron';
import type { NewsSource } from '../types/index.js';
import { fetchAllNews } from './feedFetcher.js';

type FetchCallback = (articles: any[], errors: any[]) => void | Promise<void>;

class FeedScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private fetchCallback: FetchCallback | null = null;

  /**
   * Set the callback function to be called when feeds are fetched
   */
  setFetchCallback(callback: FetchCallback): void {
    this.fetchCallback = callback;
  }

  /**
   * Schedule automatic fetching for sources
   * @param sources Array of news sources to schedule
   * @param schedule Cron expression (default: every 15 minutes)
   */
  scheduleFeeds(sources: NewsSource[], schedule: string = '*/15 * * * *'): void {
    // Clear existing tasks
    this.clearAll();

    if (sources.length === 0) {
      return;
    }

    const task = cron.schedule(schedule, async () => {
      try {
        const enabledSources = sources.filter((s) => s.enabled);
        if (enabledSources.length === 0) {
          return;
        }

        const { articles, errors } = await fetchAllNews(enabledSources);

        if (this.fetchCallback) {
          await this.fetchCallback(articles, errors);
        }
      } catch (error) {
        console.error('Error in scheduled feed fetch:', error);
      }
    });

    this.tasks.set('default', task);
  }

  /**
   * Clear all scheduled tasks
   */
  clearAll(): void {
    this.tasks.forEach((task) => task.stop());
    this.tasks.clear();
  }

  /**
   * Get active schedule count
   */
  getActiveScheduleCount(): number {
    return this.tasks.size;
  }
}

export const feedScheduler = new FeedScheduler();

