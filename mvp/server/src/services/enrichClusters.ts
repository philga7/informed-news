import type { Article } from '../types/article.js';
import type {
  ClusterEnrichmentPayload,
  ClusterEnrichmentRecord,
} from '../types/clusterEnrichment.js';
import {
  getClusterEnrichment,
  readArticles,
  upsertClusterEnrichment,
} from '../store/index.js';
import { CLASSIFY_RAW_DELIMITER } from './ollamaFraming.js';
import type { EnrichClusterResult, EnrichMemberInput } from './ollamaEnrichment.js';
import { enrichCluster } from './ollamaEnrichment.js';

const DEFAULT_BATCH_LIMIT = 10;

export type EnrichBatchOptions = {
  /** Max unenriched clusters to process (default 10). */
  limit?: number;
  /** Re-enrich keys even if enrichment already exists. */
  force?: boolean;

  /**
   * Dependency injection (tests): override IO and enrichment call.
   * Avoids experimental module mocks and avoids requiring OLLAMA_API_KEY.
   */
  readArticlesFn?: () => Promise<Article[]>;
  getClusterEnrichmentFn?: (key: string) => Promise<ClusterEnrichmentRecord | null>;
  upsertClusterEnrichmentFn?: (
    record: ClusterEnrichmentRecord,
  ) => Promise<ClusterEnrichmentRecord>;
  enrichFn?: (members: EnrichMemberInput[]) => Promise<EnrichClusterResult>;
  nowIsoFn?: () => string;
};

export type EnrichBatchResult = {
  limit: number;
  attempted: number;
  succeeded: number;
  failed: number;
  keys: string[];
};

function resolveBatchLimit(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const fromEnv = Number(process.env.ENRICH_BATCH_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return DEFAULT_BATCH_LIMIT;
}

function groupKey(article: Article): string {
  return article.clusterId?.trim() || `solo:${article.id}`;
}

function newestKey(article: Article): string {
  return article.publishedAt || article.fetchedAt || '';
}

function membersToInput(articles: Article[]): EnrichMemberInput[] {
  return articles.map((a) => ({
    title: a.title,
    snippet: a.snippet,
    publisherDomain: a.publisherDomain?.trim() || 'unknown',
    publishedAt: newestKey(a) || 'unknown',
    framingSummary: a.classification?.framingSummary?.trim() || undefined,
  }));
}

/**
 * Enrich clusters that do not yet have a successful enrichment record.
 * Groups articles by adapter key: clusterId or `solo:{articleId}`.
 */
export async function enrichUnenrichedClusters(
  options: EnrichBatchOptions = {},
): Promise<EnrichBatchResult> {
  const limit = resolveBatchLimit(options.limit);
  const force = Boolean(options.force);

  const readArticlesFn = options.readArticlesFn ?? readArticles;
  const getEnrichmentFn = options.getClusterEnrichmentFn ?? getClusterEnrichment;
  const upsertFn = options.upsertClusterEnrichmentFn ?? upsertClusterEnrichment;
  const enrichFn = options.enrichFn ?? enrichCluster;
  const nowIsoFn = options.nowIsoFn ?? (() => new Date().toISOString());

  const articles = await readArticlesFn();
  const byKey = new Map<string, Article[]>();
  for (const a of articles) {
    const key = groupKey(a);
    const list = byKey.get(key) ?? [];
    list.push(a);
    byKey.set(key, list);
  }

  const clusters = [...byKey.entries()]
    .map(([key, members]) => {
      const newest = members
        .map(newestKey)
        .filter(Boolean)
        .sort()
        .slice(-1)[0];
      return { key, members, newest: newest || '' };
    })
    .sort((a, b) => b.newest.localeCompare(a.newest));

  const keysAttempted: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const cluster of clusters) {
    if (keysAttempted.length >= limit) break;

    const existing = await getEnrichmentFn(cluster.key);
    if (!force && existing && existing.enrichment !== null) {
      continue;
    }

    keysAttempted.push(cluster.key);

    const result = await enrichFn(membersToInput(cluster.members));
    const at = nowIsoFn();

    if (result.ok) {
      const record: ClusterEnrichmentRecord = {
        key: cluster.key,
        enrichment: result.enrichment as ClusterEnrichmentPayload,
        enrichedAt: at,
        enrichError: null,
        model: result.model,
      };
      await upsertFn(record);
      succeeded += 1;
      continue;
    }

    const enrichError = result.rawText
      ? `${result.error}${CLASSIFY_RAW_DELIMITER}${result.rawText}`
      : result.error;

    const record: ClusterEnrichmentRecord = {
      key: cluster.key,
      enrichment: null,
      enrichedAt: null,
      enrichError,
      model: result.model,
    };
    await upsertFn(record);
    failed += 1;
  }

  return {
    limit,
    attempted: keysAttempted.length,
    succeeded,
    failed,
    keys: keysAttempted,
  };
}

