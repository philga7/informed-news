import type {
  CitationCheckItem,
  CitationSourceRecord,
  CourtCacheEntry,
  CourtCacheHit,
} from '../../types/citationGuard.js';
import {
  citationSourceContentHash,
  citationSourceRecordId,
} from '../../store/citationSourcesStore.js';
import {
  isCourtCacheEntryFresh,
  putCitationCourtCacheEntries,
  readCitationCourtCache,
} from '../../store/citationCourtCacheStore.js';

const COURT_ORIGIN = 'https://www.courtlistener.com';
const CITATION_LOOKUP_URL = `${COURT_ORIGIN}/api/rest/v4/citation-lookup/`;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_TEXT_CHARS = 64_000;

const PROCEDURAL_PATTERNS = [
  'dismissed for lack of standing',
  'lack of standing',
  'want of standing',
  'dismissed as untimely',
  'time-barred',
  'statute of limitations',
  'lack of jurisdiction',
  'want of jurisdiction',
  'for lack of subject-matter jurisdiction',
  'for lack of personal jurisdiction',
];

export type CourtFetch = (url: string, init: RequestInit) => Promise<Response>;

export type CourtAttachment = {
  status: 'resolved' | 'unresolved';
  courtRecordUrl: string | null;
  text: string | null;
  procedural: boolean;
  /** Source fields, present when resolved. */
  url: string | null;
  runId: string;
  articleId: string | null;
};

export type LookupCourtCitationsOptions = {
  runId: string;
  now: Date;
  articleId: string | null;
  token: string | null | undefined;
  fetchImpl?: CourtFetch;
  sleep?: (ms: number) => Promise<void>;
  cachePath?: string;
  /** Per-request timeout (headers + body); default 10s. */
  timeoutMs?: number;
};

export type LookupCourtCitationsResult = {
  /** Keyed by normalized cite, else court URL (see `courtItemKey`). */
  attachments: Record<string, CourtAttachment>;
  /** Not registered here; the guard run registers them. */
  sources: CitationSourceRecord[];
};

type Lookup = { hit: CourtCacheHit | null; cacheable: boolean };

export function normalizeCourtCite(cite: string): string {
  return cite.replace(/\s+/g, ' ').trim();
}

/** Normalized cite, else trimmed court URL; null when the item has neither. */
export function courtItemKey(item: CitationCheckItem): string | null {
  const cite = item.citation ? normalizeCourtCite(item.citation) : '';
  if (cite) return cite;
  const url = item.url?.trim();
  return url || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function absolutize(url: string): string {
  return url.startsWith('/') ? `${COURT_ORIGIN}${url}` : url;
}

function isProceduralText(text: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PROCEDURAL_PATTERNS.some((p) => lower.includes(p));
}

function redact(message: string, token: string): string {
  return token ? message.split(token).join('[redacted]') : message;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function productionFetch(url: string, init: RequestInit): Promise<Response> {
  if (process.env.NODE_TEST_CONTEXT) {
    throw new Error('CourtListener live HTTP is disabled in tests; pass fetchImpl');
  }
  return fetch(url, init);
}

function unresolved(opts: LookupCourtCitationsOptions): CourtAttachment {
  return {
    status: 'unresolved',
    courtRecordUrl: null,
    text: null,
    procedural: false,
    url: null,
    runId: opts.runId,
    articleId: opts.articleId,
  };
}

function resolvedFrom(hit: CourtCacheHit, opts: LookupCourtCitationsOptions): CourtAttachment {
  return {
    status: 'resolved',
    courtRecordUrl: hit.url,
    text: hit.text,
    procedural: hit.procedural,
    url: hit.url,
    runId: opts.runId,
    articleId: opts.articleId,
  };
}

function clusterHit(clusters: unknown[]): CourtCacheHit | null {
  let first: CourtCacheHit | null = null;
  let procedural = false;
  for (const raw of clusters) {
    if (!isRecord(raw)) continue;
    const url = str(raw.absolute_url);
    if (!url) continue;
    const syllabus = str(raw.syllabus);
    const caseName = str(raw.case_name);
    procedural ||= isProceduralText(syllabus ?? caseName);
    first ??= { url: absolutize(url), text: syllabus ?? caseName ?? absolutize(url), procedural: false };
  }
  return first ? { ...first, procedural } : null;
}

function docketId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = /^\/(?:docket|recap)\/(\d+)(?:\/|$)/.exec(parsed.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isOpinionUrl(url: string): boolean {
  try {
    return /^\/opinion\/\d+(?:\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

type CourtResponse = { status: number; body: unknown };

class Requester {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: CourtFetch,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly now: Date,
    private readonly timeoutMs: number,
  ) {}

  /** Headers and body are both read under one timeout; a stalled body rejects. */
  private async once(url: string, init: RequestInit): Promise<CourtResponse> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });
    const work = (async (): Promise<CourtResponse> => {
      const res = await this.fetchImpl(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Token ${this.token}` },
        signal: controller.signal,
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch (err) {
        if (controller.signal.aborted) throw err;
      }
      return { status: res.status, body };
    })();
    work.catch(() => {});
    try {
      return await Promise.race([work, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One retry after a short `wait_until` / `wait_util` backoff on HTTP 429. */
  async request(url: string, init: RequestInit): Promise<CourtResponse> {
    const res = await this.once(url, init);
    if (res.status !== 429) return res;
    const wait = this.waitMs(res.body);
    if (wait === null) return res;
    await this.sleep(wait);
    return this.once(url, init);
  }

  private waitMs(body: unknown): number | null {
    if (!isRecord(body)) return null;
    const until = str(body.wait_until) ?? str(body.wait_util);
    if (!until) return null;
    const at = Date.parse(until);
    if (Number.isNaN(at)) return null;
    const delta = at - this.now.getTime();
    return delta <= MAX_BACKOFF_MS ? Math.max(delta, 0) : null;
  }
}

async function lookupCites(
  cites: string[],
  requester: Requester,
): Promise<Map<string, Lookup>> {
  const out = new Map<string, Lookup>();
  const fit: string[] = [];
  let length = 0;
  for (const cite of cites) {
    const next = length + cite.length + (fit.length ? 1 : 0);
    if (next > MAX_TEXT_CHARS) break;
    fit.push(cite);
    length = next;
  }
  if (fit.length === 0) return out;

  const res = await requester.request(CITATION_LOOKUP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text: fit.join('\n') }).toString(),
  });
  if (res.status !== 200) return out;
  const body = res.body;
  if (!Array.isArray(body)) return out;

  for (const row of body) {
    if (!isRecord(row)) continue;
    const names = [
      ...(Array.isArray(row.normalized_citations) ? row.normalized_citations : []),
      row.citation,
    ].filter((v): v is string => typeof v === 'string');
    const key = fit.find((cite) => names.some((n) => normalizeCourtCite(n) === cite));
    if (!key || out.has(key)) continue;
    const status = row.status;
    const clusters = Array.isArray(row.clusters) ? row.clusters : [];
    if (status === 200 || status === 300) {
      const hit = clusterHit(clusters);
      out.set(key, { hit, cacheable: true });
    } else if (status === 404) {
      out.set(key, { hit: null, cacheable: true });
    } else {
      out.set(key, { hit: null, cacheable: false });
    }
  }
  return out;
}

async function lookupDocket(url: string, id: string, requester: Requester): Promise<Lookup> {
  const res = await requester.request(`${COURT_ORIGIN}/api/rest/v4/dockets/${id}/`, { method: 'GET' });
  if (res.status === 404) return { hit: null, cacheable: true };
  if (res.status !== 200) return { hit: null, cacheable: false };
  const body = res.body;
  if (!isRecord(body)) return { hit: null, cacheable: false };
  const absolute = str(body.absolute_url);
  const cause = str(body.cause);
  const caseName = str(body.case_name);
  const recordUrl = absolute ? absolutize(absolute) : url;
  return {
    hit: { url: recordUrl, text: cause ?? caseName ?? recordUrl, procedural: isProceduralText(cause ?? caseName) },
    cacheable: true,
  };
}

/**
 * Look up court items (reporter cites, docket / recap URLs; opinion URLs stay unresolved) on CourtListener,
 * through a 7-day parsed-hit cache. Never throws on network failure; failures
 * leave the item unresolved. Does not register sources.
 */
export async function lookupCourtCitations(
  items: CitationCheckItem[],
  opts: LookupCourtCitationsOptions,
): Promise<LookupCourtCitationsResult> {
  const keys: string[] = [];
  for (const item of items) {
    if (item.kind !== 'court') continue;
    const key = courtItemKey(item);
    if (key && !keys.includes(key)) keys.push(key);
  }

  const attachments: Record<string, CourtAttachment> = {};
  const token = opts.token?.trim() ?? '';
  if (!token) {
    for (const key of keys) attachments[key] = unresolved(opts);
    return { attachments, sources: [] };
  }

  const warn = (message: string) => console.warn(`[court-citations] ${redact(message, token)}`);

  let cached: Record<string, CourtCacheEntry> = {};
  try {
    cached = (await readCitationCourtCache(opts.cachePath)).entries;
  } catch (err) {
    warn(`cache read failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const results = new Map<string, Lookup>();
  const cites: string[] = [];
  const urls: string[] = [];
  const itemByKey = new Map<string, CitationCheckItem>();
  for (const item of items) {
    const key = courtItemKey(item);
    if (item.kind === 'court' && key) itemByKey.set(key, item);
  }
  for (const key of keys) {
    if (isOpinionUrl(key)) continue;
    const entry = cached[key];
    if (entry && isCourtCacheEntryFresh(entry, opts.now)) {
      results.set(key, { hit: entry.hit, cacheable: false });
    } else if (itemByKey.get(key)?.citation) {
      cites.push(key);
    } else {
      urls.push(key);
    }
  }

  const requester = new Requester(token, opts.fetchImpl ?? productionFetch, opts.sleep ?? defaultSleep, opts.now, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const fresh = new Map<string, Lookup>();

  if (cites.length > 0) {
    try {
      for (const [key, value] of await lookupCites(cites, requester)) fresh.set(key, value);
    } catch (err) {
      warn(`citation lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const key of urls) {
    const id = docketId(key);
    if (!id) continue;
    try {
      fresh.set(key, await lookupDocket(key, id, requester));
    } catch (err) {
      warn(`docket lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const toCache: CourtCacheEntry[] = [];
  const fetchedAt = opts.now.toISOString();
  for (const [key, lookup] of fresh) {
    results.set(key, lookup);
    if (lookup.cacheable) toCache.push({ key, fetchedAt, hit: lookup.hit });
  }
  try {
    await putCitationCourtCacheEntries(toCache, opts.cachePath);
  } catch (err) {
    warn(`cache write failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const sources = new Map<string, CitationSourceRecord>();
  for (const key of keys) {
    const hit = results.get(key)?.hit ?? null;
    if (!hit) {
      attachments[key] = unresolved(opts);
      continue;
    }
    attachments[key] = resolvedFrom(hit, opts);
    const contentHash = citationSourceContentHash(hit.text);
    const id = citationSourceRecordId(contentHash, opts.runId);
    sources.set(id, {
      id,
      url: hit.url,
      text: hit.text,
      fetchedAt,
      runId: opts.runId,
      contentHash,
      articleId: opts.articleId,
      procedural: hit.procedural,
    });
  }
  return { attachments, sources: [...sources.values()] };
}
