import * as cheerio from 'cheerio';
import { isRetryableNetworkError } from './isRetryableNetworkError.js';

const DEFAULT_SOURCE_DOMAIN = 'citizenfreepress.com';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
const USER_AGENT = 'Informed News MVP';

const CONTENT_SELECTORS = [
  'article',
  '.entry-content',
  '.post-content',
  '.entry',
  'main',
  '#content',
];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isExternalHttpLink(href: string | undefined, sourceDomain: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:')) return false;
  if (trimmed.startsWith('javascript:')) return false;

  try {
    const absolute = new URL(trimmed, `https://${sourceDomain}`);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return false;
    const host = absolute.hostname.replace(/^www\./, '');
    return !host.includes(sourceDomain);
  } catch {
    return false;
  }
}

function resolveHref(href: string, pageUrl: string): string | null {
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return href.startsWith('http') ? href : null;
  }
}

/**
 * Find the first external http(s) link under a CSS selector (or document-wide when selector is null).
 */
function firstExternalLink(
  $: ReturnType<typeof cheerio.load>,
  pageUrl: string,
  sourceDomain: string,
  scopeSelector: string | null,
): string | null {
  const nodes = scopeSelector ? $(scopeSelector).first().find('a[href]') : $('a[href]');
  let found: string | null = null;

  nodes.each((_i, el) => {
    if (found) return;
    const href = $(el).attr('href');
    if (!isExternalHttpLink(href, sourceDomain) || !href) return;
    found = resolveHref(href, pageUrl);
  });

  return found;
}

function extractPublisherUrl(
  html: string,
  pageUrl: string,
  sourceDomain: string,
): string | null {
  const $ = cheerio.load(html);

  for (const selector of CONTENT_SELECTORS) {
    if ($(selector).length === 0) continue;
    const found = firstExternalLink($, pageUrl, sourceDomain, selector);
    if (found) return found;
  }

  return firstExternalLink($, pageUrl, sourceDomain, null);
}

async function fetchPublisherPage(
  pageUrl: string,
  retryCount: number,
  signal: AbortSignal,
  maxRetries: number,
): Promise<Response> {
  try {
    return await fetch(pageUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal,
    });
  } catch (err) {
    if (!signal.aborted && isRetryableNetworkError(err) && retryCount < maxRetries) {
      console.warn(
        `Network error scraping ${pageUrl}, retrying (${retryCount + 1}/${maxRetries})...`,
      );
      return fetchPublisherPage(pageUrl, retryCount + 1, signal, maxRetries);
    }
    throw err;
  }
}

/**
 * Scrape a CFP (aggregator) article page for the original publisher URL.
 * Prefers links inside common content containers; falls back to first page-wide external link.
 * Returns null when no external publisher link is found (caller keeps canonicalUrl).
 * `timeoutMs` bounds the whole call: headers, body, and any retry. A timeout is never retried.
 */
export async function scrapePublisherUrl(
  pageUrl: string,
  sourceDomain: string = DEFAULT_SOURCE_DOMAIN,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);

  try {
    const response = await fetchPublisherPage(
      pageUrl,
      0,
      controller.signal,
      opts.retries ?? MAX_RETRIES,
    );
    if (!response.ok) {
      console.warn(`Publisher scrape HTTP ${response.status} for ${pageUrl}`);
      return null;
    }

    const html = await response.text();
    return extractPublisherUrl(html, pageUrl, sourceDomain);
  } catch (err) {
    console.warn(
      `Publisher scrape failed for ${pageUrl}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    clearTimeout(timer);
    // Releases the socket of an error response whose body was never read.
    controller.abort();
  }
}

/** Derive publisher domain from a resolved publisher URL, or null. */
export function publisherDomainFromUrl(publisherUrl: string | null): string | null {
  if (!publisherUrl) return null;
  return hostnameOf(publisherUrl);
}
