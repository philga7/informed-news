import * as cheerio from 'cheerio';
import type { BodyStatus } from '../types/article.js';
import { truncateBodyText } from '../types/article.js';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
const USER_AGENT = 'Informed News MVP';
/** Below this, treat extracted text as empty/boilerplate. */
const MIN_BODY_CHARS = 200;

const CONTENT_SELECTORS = [
  'article',
  '[itemprop="articleBody"]',
  '.article-body',
  '.article-content',
  '.story-body',
  '.entry-content',
  '.post-content',
  '.post-body',
  '.entry',
  'main',
  '#content',
];

const STRIP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'iframe',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '.advertisement',
  '.ad',
  '.ads',
  '.social-share',
  '.share-buttons',
  '.newsletter',
  '.paywall',
  '.subscription',
];

const BLOCKED_HTTP = new Set([401, 402, 403]);

const PAYWALL_PATTERNS = [
  /subscribe\s+to\s+(continue|read|unlock)/i,
  /sign\s+in\s+to\s+(continue|read)/i,
  /create\s+an?\s+account\s+to\s+(continue|read)/i,
  /already\s+a\s+subscriber/i,
  /this\s+article\s+is\s+for\s+subscribers/i,
  /metered\s+paywall/i,
  /remaining\s+free\s+articles/i,
];

export type PublisherBodyResult = {
  bodyText: string | null;
  bodyStatus: Extract<BodyStatus, 'ok' | 'unavailable' | 'blocked'>;
  publisherTitle: string | null;
};

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  );
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Do not scrape X / Twitter pages (xcancel items already carry tweet text). */
export function isBlockedPublisherHost(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return true;
  return (
    host === 'x.com' ||
    host === 'twitter.com' ||
    host === 'mobile.twitter.com' ||
    host.endsWith('.x.com') ||
    host.endsWith('.twitter.com')
  );
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function looksPaywalled(html: string, text: string): boolean {
  const haystack = `${html}\n${text}`;
  return PAYWALL_PATTERNS.some((re) => re.test(haystack));
}

function extractTitle($: cheerio.CheerioAPI): string | null {
  const og =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content');
  if (og && og.trim()) {
    return normalizeWhitespace(og);
  }
  const title = $('title').first().text();
  if (title && title.trim()) {
    return normalizeWhitespace(title);
  }
  const h1 = $('h1').first().text();
  if (h1 && h1.trim()) {
    return normalizeWhitespace(h1);
  }
  return null;
}

function extractMainText($: cheerio.CheerioAPI): string {
  const root = $.root();
  root.find(STRIP_SELECTORS.join(', ')).remove();

  for (const selector of CONTENT_SELECTORS) {
    const node = $(selector).first();
    if (node.length === 0) continue;
    const text = normalizeWhitespace(node.text());
    if (text.length >= MIN_BODY_CHARS) {
      return text;
    }
  }

  // Fallback: concatenate paragraph text from the cleaned document.
  const paragraphs: string[] = [];
  $('p').each((_i, el) => {
    const t = normalizeWhitespace($(el).text());
    if (t.length > 40) {
      paragraphs.push(t);
    }
  });
  return normalizeWhitespace(paragraphs.join(' '));
}

/**
 * Pure HTML → body fields (no network). Used by scrape + unit tests.
 */
export function extractPublisherBodyFromHtml(html: string): PublisherBodyResult {
  const $ = cheerio.load(html);
  const publisherTitle = extractTitle($);
  const rawText = extractMainText($);
  const bodyText = rawText ? truncateBodyText(rawText) : null;

  if (looksPaywalled(html, rawText) && (!bodyText || bodyText.length < MIN_BODY_CHARS * 2)) {
    return { bodyText: null, bodyStatus: 'blocked', publisherTitle };
  }

  if (!bodyText || bodyText.length < MIN_BODY_CHARS) {
    if (looksPaywalled(html, rawText)) {
      return { bodyText: null, bodyStatus: 'blocked', publisherTitle };
    }
    return { bodyText: null, bodyStatus: 'unavailable', publisherTitle };
  }

  return { bodyText, bodyStatus: 'ok', publisherTitle };
}

async function fetchHtml(url: string, retryCount: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
  } catch (err) {
    if (isRetryableNetworkError(err) && retryCount < MAX_RETRIES) {
      console.warn(
        `Network error fetching body ${url}, retrying (${retryCount + 1}/${MAX_RETRIES})...`,
      );
      return fetchHtml(url, retryCount + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort publisher body scrape. Never throws for caller convenience —
 * failures become unavailable/blocked. Does not bypass paywalls.
 */
export async function scrapePublisherBody(
  publisherUrl: string | null | undefined,
): Promise<PublisherBodyResult> {
  if (!publisherUrl) {
    return { bodyText: null, bodyStatus: 'unavailable', publisherTitle: null };
  }

  if (isBlockedPublisherHost(publisherUrl)) {
    return { bodyText: null, bodyStatus: 'unavailable', publisherTitle: null };
  }

  try {
    const response = await fetchHtml(publisherUrl, 0);

    if (BLOCKED_HTTP.has(response.status)) {
      return { bodyText: null, bodyStatus: 'blocked', publisherTitle: null };
    }

    if (!response.ok) {
      console.warn(`Publisher body HTTP ${response.status} for ${publisherUrl}`);
      return { bodyText: null, bodyStatus: 'unavailable', publisherTitle: null };
    }

    const html = await response.text();
    return extractPublisherBodyFromHtml(html);
  } catch (err) {
    console.warn(
      `Publisher body scrape failed for ${publisherUrl}:`,
      err instanceof Error ? err.message : err,
    );
    return { bodyText: null, bodyStatus: 'unavailable', publisherTitle: null };
  }
}
