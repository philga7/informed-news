import { createHash } from 'node:crypto';
import {
  citationSourceContentHash,
  citationSourceRecordId,
  putCitationCheckLog,
  readCitationSources,
  registerCitationSources,
} from '../../store/index.js';
import type {
  CitationCheckItem,
  CitationCheckLogEntry,
  CitationCheckResult,
  CitationKind,
  CitationScope,
  CitationSourceRecord,
} from '../../types/citationGuard.js';
import { checkCitationItems, filterCitationSourcesForRun } from './registry.js';
import { normalizeCitationUrl } from './resolvers/urlResolver.js';

/**
 * Run id choice (NEWS-172 Task 5):
 * - Refresh: prefer the shared refresh `startedAt` / `boundaryAt` ISO string so
 *   summaries and full stories in one refresh share one source set.
 * - On-demand / default: `now.toISOString()`.
 */
export function citationGuardRunId(now: Date, sharedRunId?: string | null): string {
  if (typeof sharedRunId === 'string' && sharedRunId.trim()) return sharedRunId.trim();
  return now.toISOString();
}

/** Stable log identity: normalized url, sha256-16 of quote, or claim key. */
export function citationCheckItemId(item: CitationCheckItem | CitationCheckResult): string {
  if (typeof item.id === 'string' && item.id) return item.id;

  const kind: CitationKind = item.kind;
  switch (kind) {
    case 'url': {
      const raw = typeof item.url === 'string' ? item.url : '';
      const normalized = raw.trim() ? normalizeCitationUrl(raw) : '';
      return normalized || 'url:empty';
    }
    case 'quote': {
      const quote = typeof item.quote === 'string' ? item.quote : '';
      return `quote:${createHash('sha256').update(quote).digest('hex').slice(0, 16)}`;
    }
    case 'claim': {
      const refuting =
        typeof item.refutingUrl === 'string' && item.refutingUrl.trim()
          ? normalizeCitationUrl(item.refutingUrl)
          : '';
      const claimText = typeof item.claimText === 'string' ? item.claimText : '';
      const key = `${refuting}\n${claimText}`;
      return `claim:${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
    }
    case 'court': {
      const key =
        (typeof item.url === 'string' && item.url) ||
        (typeof item.claimText === 'string' && item.claimText) ||
        'court';
      return `court:${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function citationCheckResultToLogEntry(
  result: CitationCheckResult,
  checkedAt: string,
  runId: string,
  scope: CitationScope,
): CitationCheckLogEntry {
  return {
    kind: result.kind,
    status: result.status,
    display: result.display,
    itemId: citationCheckItemId(result),
    ...(result.url !== undefined ? { url: result.url } : {}),
    ...(result.quote !== undefined ? { quote: result.quote } : {}),
    ...(result.refutingUrl !== undefined ? { refutingUrl: result.refutingUrl } : {}),
    scope,
    checkedAt,
    runId,
  };
}

function failClosedResults(items: CitationCheckItem[]): CitationCheckResult[] {
  return items.map((item) => ({
    kind: item.kind,
    status: 'missing-source' as const,
    display: item.kind === 'claim' ? ('unconfirmed' as const) : ('unverified' as const),
    ...(item.url !== undefined ? { url: item.url } : {}),
    ...(item.quote !== undefined ? { quote: item.quote } : {}),
    ...(item.refutingUrl !== undefined ? { refutingUrl: item.refutingUrl } : {}),
    ...(item.claimText !== undefined ? { claimText: item.claimText } : {}),
    ...(item.id !== undefined ? { id: item.id } : {}),
  }));
}

export type RunCitationGuardDeps = {
  putCitationCheckLog?: typeof putCitationCheckLog;
  checkCitationItems?: typeof checkCitationItems;
};

export type RunCitationGuardArgs = {
  articleId: string;
  scope: CitationScope;
  runId: string;
  now: Date;
  sourcesForRun: CitationSourceRecord[];
  items: CitationCheckItem[];
};

/**
 * Check items against this run's sources, persist the per-article log, return results.
 * Fails closed: a check error yields one missing-source result per item.
 * Never throws to the caller.
 */
export async function runCitationGuardForArticle(
  args: RunCitationGuardArgs,
  deps: RunCitationGuardDeps = {},
): Promise<CitationCheckResult[]> {
  const check = deps.checkCitationItems ?? checkCitationItems;
  const putLog = deps.putCitationCheckLog ?? putCitationCheckLog;
  let results: CitationCheckResult[] = [];

  try {
    results = check(args.items, args.sourcesForRun);
  } catch (err) {
    console.warn('[citation-guard] check failed; marking items unverified', err);
    results = failClosedResults(args.items);
  }

  try {
    const checkedAt = args.now.toISOString();
    await putLog({
      articleId: args.articleId,
      entries: results.map((r) => citationCheckResultToLogEntry(r, checkedAt, args.runId, args.scope)),
      updatedAt: checkedAt,
      runId: args.runId,
    });
  } catch (err) {
    console.warn('[citation-guard] could not persist check log', err);
  }

  return results;
}

export type CitationSourceCandidate = {
  url: string | null;
  text: string;
  articleId: string | null;
};

export type RegisterAndGuardDeps = RunCitationGuardDeps & {
  registerCitationSources?: typeof registerCitationSources;
  readCitationSources?: typeof readCitationSources;
};

export type RegisterAndGuardArgs = {
  articleId: string;
  scope: CitationScope;
  runId: string;
  now: Date;
  sourceCandidates: CitationSourceCandidate[];
  items: CitationCheckItem[];
};

/**
 * Register source candidates for this runId (same-hash reuse, GN filtered by register),
 * then run the citation guard. Never throws.
 */
export async function registerSourcesAndRunCitationGuard(
  args: RegisterAndGuardArgs,
  deps: RegisterAndGuardDeps = {},
): Promise<CitationCheckResult[]> {
  const register = deps.registerCitationSources ?? registerCitationSources;
  const readSources = deps.readCitationSources ?? readCitationSources;
  let sourcesForRun: CitationSourceRecord[] = [];
  try {
    const fetchedAt = args.now.toISOString();

    const records: CitationSourceRecord[] = args.sourceCandidates
      .filter((c) => typeof c.text === 'string' && c.text.trim())
      .map((c) => {
        const contentHash = citationSourceContentHash(c.text);
        return {
          id: citationSourceRecordId(contentHash, args.runId),
          url: c.url,
          text: c.text,
          fetchedAt,
          runId: args.runId,
          contentHash,
          articleId: c.articleId,
        };
      });

    if (records.length > 0) {
      await register(records);
    }

    const store = await readSources();
    sourcesForRun = filterCitationSourcesForRun(store.sources, args.runId);
  } catch (err) {
    console.warn('[citation-guard] could not register sources; checking with loaded sources', err);
  }

  return runCitationGuardForArticle(
    {
      articleId: args.articleId,
      scope: args.scope,
      runId: args.runId,
      now: args.now,
      sourcesForRun,
      items: args.items,
    },
    deps,
  );
}

// Re-export filter helper for wire-in callers that already hold an in-memory store.
export { filterCitationSourcesForRun };
