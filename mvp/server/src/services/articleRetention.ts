/**
 * Article store retention (NEWS-117): after each successful refresh, drop
 * articles triage can no longer use. Their triage records go at the next
 * triage write and their Brief caches at the next Brief prune.
 */
import { pruneArticles, readEvidenceLinks, readTriage } from '../store/index.js';
import type { Article } from '../types/article.js';
import type { EvidenceLink } from '../types/claim.js';
import type { TriageStore } from '../types/triage.js';
import { ARTICLE_RETENTION_DAYS, TRIAGE_WINDOW_HOURS } from './triageConfig.js';

export type ArticleRetentionDeps = {
  readTriage?: () => Promise<TriageStore>;
  readEvidenceLinks?: () => Promise<EvidenceLink[]>;
  pruneArticles?: (selectKept: (articles: readonly Article[]) => Article[]) => Promise<number>;
};

export type ArticleRetentionResult = {
  /** Articles removed */
  articles: number;
  errors: string[];
};

const HOUR_MS = 60 * 60 * 1000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Latest parseable of publishedAt / fetchedAt / searchSeenAt; NaN when none parses. */
function lastSeenAt(article: Article): number {
  const times = [article.publishedAt, article.fetchedAt, article.searchSeenAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((time) => !Number.isNaN(time));
  return times.length > 0 ? Math.max(...times) : Number.NaN;
}

/**
 * Keep an article while it was last seen within ARTICLE_RETENTION_DAYS (has a
 * triage record) or TRIAGE_WINDOW_HOURS (no record), or while a kept-by-age
 * record names it (`duplicateOf`, `memberIds`), or an evidence link cites it.
 */
function selectKept(
  articles: readonly Article[],
  triage: TriageStore,
  citedIds: ReadonlySet<string>,
  now: Date,
): Article[] {
  const orphanCutoff = now.getTime() - TRIAGE_WINDOW_HOURS * HOUR_MS;
  const triagedCutoff = now.getTime() - ARTICLE_RETENTION_DAYS * 24 * HOUR_MS;
  const keptIds = new Set(citedIds);
  for (const article of articles) {
    const record = triage.records[article.id];
    if (!(lastSeenAt(article) >= (record ? triagedCutoff : orphanCutoff))) continue;
    keptIds.add(article.id);
    if (record?.duplicateOf) keptIds.add(record.duplicateOf);
    for (const memberId of record?.memberIds ?? []) keptIds.add(memberId);
  }
  return articles.filter((article) => keptIds.has(article.id));
}

/** Unreadable triage or evidence links → nothing is pruned. Never throws; failures are returned in `errors`. */
export async function pruneArticleStore(
  options: { now: Date },
  deps: ArticleRetentionDeps = {},
): Promise<ArticleRetentionResult> {
  const result: ArticleRetentionResult = { articles: 0, errors: [] };
  let triage: TriageStore;
  try {
    triage = await (deps.readTriage ?? (() => readTriage()))();
  } catch (err) {
    result.errors.push(`triage: ${errorMessage(err)}`);
    return result;
  }
  let citedIds: Set<string>;
  try {
    const links = await (deps.readEvidenceLinks ?? (() => readEvidenceLinks()))();
    citedIds = new Set(
      links.map((link) => link.articleId).filter((id): id is string => id !== null),
    );
  } catch (err) {
    result.errors.push(`evidence links: ${errorMessage(err)}`);
    return result;
  }
  try {
    result.articles = await (deps.pruneArticles ?? ((select) => pruneArticles(select)))(
      (articles) => selectKept(articles, triage, citedIds, options.now),
    );
  } catch (err) {
    result.errors.push(`articles prune: ${errorMessage(err)}`);
  }
  return result;
}
