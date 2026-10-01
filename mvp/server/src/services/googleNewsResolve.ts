import * as cheerio from 'cheerio';
import {
  getCachedGoogleNewsUrl,
  putCachedGoogleNewsUrl,
} from '../store/googleNewsUrlCacheStore.js';
import { USER_AGENT, googleArticleIdFromUrl } from './googleNewsRss.js';
import { GOOGLE_RESOLVE_TIMEOUT_MS } from './topicSearchConfig.js';

const BATCH_EXECUTE_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute';
const RPC_ID = 'Fbv4je';

export type ResolveGoogleNewsUrlOptions = {
  cachePath?: string;
};

export type ResolveGoogleNewsUrlDeps = {
  fetch?: typeof fetch;
};

type Signature = { sig: string; ts: number };

async function fetchSignature(articleId: string, fetchImpl: typeof fetch): Promise<Signature | null> {
  const response = await fetchImpl(`https://news.google.com/articles/${articleId}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(GOOGLE_RESOLVE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`article page ${response.status}`);
  }

  const $ = cheerio.load(await response.text());
  const el = $('[data-n-a-sg][data-n-a-ts]').first();
  const sig = el.attr('data-n-a-sg');
  const ts = el.attr('data-n-a-ts');
  return sig && ts && /^\d+$/.test(ts) ? { sig, ts: Number(ts) } : null;
}

function buildBatchExecuteBody(articleId: string, { sig, ts }: Signature): string {
  const inner = JSON.stringify([
    'garturlreq',
    [
      ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
      'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0,
    ],
    articleId,
    ts,
    sig,
  ]);
  return `f.req=${encodeURIComponent(JSON.stringify([[[RPC_ID, inner, null, 'generic']]]))}`;
}

function parseBatchExecuteUrl(text: string): string | null {
  const payload = text.split('\n\n')[1];
  if (!payload) return null;
  const envelopes: unknown = JSON.parse(payload);
  if (!Array.isArray(envelopes)) return null;

  const envelope = envelopes.find(
    (e): e is unknown[] => Array.isArray(e) && e[0] === 'wrb.fr' && e[1] === RPC_ID,
  );
  if (!envelope || typeof envelope[2] !== 'string') return null;

  const result: unknown = JSON.parse(envelope[2]);
  const url = Array.isArray(result) ? result[1] : undefined;
  return typeof url === 'string' ? url : null;
}

function isPublisherUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.toLowerCase() !== 'news.google.com'
    );
  } catch {
    return false;
  }
}

/**
 * Decode a news.google.com article link to its publisher URL via the article
 * page signature + batchexecute. Successful resolutions are cached by article
 * id (a failed cache write still returns the URL); any resolve failure returns
 * `null` (callers keep the Google link).
 */
export async function resolveGoogleNewsUrl(
  googleUrl: string,
  options: ResolveGoogleNewsUrlOptions = {},
  deps: ResolveGoogleNewsUrlDeps = {},
): Promise<string | null> {
  const articleId = googleArticleIdFromUrl(googleUrl);
  if (!articleId) return null;

  const fetchImpl = deps.fetch ?? fetch;
  try {
    const cached = await getCachedGoogleNewsUrl(articleId, options.cachePath);
    if (cached) return cached;

    const signature = await fetchSignature(articleId, fetchImpl);
    if (!signature) {
      throw new Error('article page missing data-n-a-sg / data-n-a-ts');
    }

    const response = await fetchImpl(BATCH_EXECUTE_URL, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: buildBatchExecuteBody(articleId, signature),
      signal: AbortSignal.timeout(GOOGLE_RESOLVE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`batchexecute ${response.status}`);
    }

    const url = parseBatchExecuteUrl(await response.text());
    if (!url || !isPublisherUrl(url)) {
      throw new Error('batchexecute returned no publisher URL');
    }

    try {
      await putCachedGoogleNewsUrl(articleId, url, options.cachePath);
    } catch (err) {
      console.warn(`[googleNewsResolve] ${articleId}: cache write failed: ${(err as Error).message}`);
    }
    return url;
  } catch (err) {
    console.warn(`[googleNewsResolve] ${articleId}: ${(err as Error).message}`);
    return null;
  }
}
