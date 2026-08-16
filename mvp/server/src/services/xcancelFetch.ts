import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Article } from '../types/article.js';
import {
  citationsFromXcancel,
  DATA_DIR,
  upsertArticles,
  updateMeta,
} from '../store/index.js';
import { parseRssXml } from './rss.js';

const XCANCEL_ORIGIN = 'https://xcancel.com';
const DEFAULT_PER_PROFILE_LIMIT = 10;
const DEFAULT_DELAY_MS = 1_500;
const TITLE_MAX_LEN = 160;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Informed News MVP';

const BOT_PROTECTION_MARKERS = [
  'verifying your browser',
  'just a moment',
  'checking your browser',
  'please wait',
  'cloudflare',
  'challenge-platform',
];

export type XcancelFetchOptions = {
  handles?: string[];
  perProfileLimit?: number;
  delayMs?: number;
};

export type XcancelFetchResult = {
  fetched: number;
  upserted: Article[];
  handles: string[];
  perProfileLimit: number;
  /** Empty when no profiles configured (CFP-only no-op). */
  skipped: boolean;
  errors: string[];
};

type RawTweet = {
  handle: string;
  statusId: string;
  text: string;
  publishedAt: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePerProfileLimit(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const fromEnv = Number(process.env.XCANCEL_PER_PROFILE_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return DEFAULT_PER_PROFILE_LIMIT;
}

function resolveDelayMs(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
    return Math.floor(override);
  }
  const fromEnv = Number(process.env.XCANCEL_FETCH_DELAY_MS);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return Math.floor(fromEnv);
  }
  return DEFAULT_DELAY_MS;
}

function normalizeHandle(raw: string): string | null {
  const trimmed = raw.trim().replace(/^@/, '');
  if (!trimmed) return null;
  // X handles: letters, numbers, underscore; max 15
  if (!/^[A-Za-z0-9_]{1,15}$/.test(trimmed)) return null;
  return trimmed;
}

function handlesFromEnv(): string[] {
  const raw = process.env.XCANCEL_PROFILES || '';
  return raw
    .split(',')
    .map((part) => normalizeHandle(part))
    .filter((h): h is string => Boolean(h));
}

async function handlesFromFile(): Promise<string[]> {
  const filePath = path.join(DATA_DIR, 'x-profiles.json');
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(text);
    let list: unknown[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as { handles?: unknown }).handles)
    ) {
      list = (parsed as { handles: unknown[] }).handles;
    } else {
      return [];
    }
    return list
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normalizeHandle(item))
      .filter((h): h is string => Boolean(h));
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/** Merge env + optional mvp/data/x-profiles.json (deduped, order preserved). */
export async function resolveXcancelHandles(
  override?: string[],
): Promise<string[]> {
  if (override && override.length > 0) {
    const normalized = override
      .map((h) => normalizeHandle(h))
      .filter((h): h is string => Boolean(h));
    return [...new Set(normalized)];
  }
  const fromEnv = handlesFromEnv();
  const fromFile = await handlesFromFile();
  return [...new Set([...fromEnv, ...fromFile])];
}

function truncateTitle(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= TITLE_MAX_LEN) return collapsed || '(empty post)';
  return `${collapsed.slice(0, TITLE_MAX_LEN - 1)}…`;
}

function isBotProtectionPage(html: string, status: number): boolean {
  if (status === 403 || status === 503) return true;
  const lower = html.toLowerCase();
  return BOT_PROTECTION_MARKERS.some((marker) => lower.includes(marker));
}

function extractStatusId(urlOrPath: string): string | null {
  const match = urlOrPath.match(/\/status(?:es)?\/(\d+)/i);
  return match?.[1] ?? null;
}

function toXPermalink(handle: string, statusId: string): string {
  return `https://x.com/${handle}/status/${statusId}`;
}

function toXcancelStatusUrl(handle: string, statusId: string): string {
  return `${XCANCEL_ORIGIN}/${handle}/status/${statusId}`;
}

function parseNitterDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Nitter title often: "Mar 15, 2024 · 3:45 PM UTC"
  const normalized = trimmed.replace(/\s*·\s*/, ' ').replace(/\s+UTC$/i, ' UTC');
  const ms = Date.parse(normalized);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  const fallback = Date.parse(trimmed);
  if (Number.isFinite(fallback)) return new Date(fallback).toISOString();
  return null;
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
      },
      signal: controller.signal,
    });
    const body = await response.text();
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTweetsViaRss(
  handle: string,
  limit: number,
): Promise<RawTweet[]> {
  const rssUrl = `${XCANCEL_ORIGIN}/${handle}/rss`;

  // Probe once so Cloudflare / 403 are explicit before parseRssFeed's generic error.
  const { status, body } = await fetchText(rssUrl);
  if (isBotProtectionPage(body, status)) {
    throw new Error(
      `xcancel RSS blocked for @${handle} (HTTP ${status} / bot protection)`,
    );
  }
  if (status >= 400) {
    throw new Error(`xcancel RSS failed for @${handle} (HTTP ${status})`);
  }
  if (/not yet whitelisted/i.test(body)) {
    throw new Error(
      `xcancel RSS not whitelisted for @${handle} (email rss@xcancel.com to register this reader)`,
    );
  }

  let items;
  try {
    items = await parseRssXml(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`xcancel RSS parse failed for @${handle}: ${message}`);
  }

  const tweets: RawTweet[] = [];
  for (const item of items) {
    if (tweets.length >= limit) break;
    const statusId = extractStatusId(item.link);
    if (!statusId) continue;
    const text = (item.snippet || item.title || '').trim();
    if (!text) continue;

    tweets.push({
      handle,
      statusId,
      text,
      publishedAt: item.publishedAt,
    });
  }

  if (tweets.length === 0) {
    throw new Error(`xcancel RSS empty for @${handle}`);
  }

  return tweets;
}

function parseTimelineHtml(handle: string, html: string, limit: number): RawTweet[] {
  const $ = cheerio.load(html);
  const tweets: RawTweet[] = [];

  $('.timeline-item').each((_i, element) => {
    if (tweets.length >= limit) return;

    const $item = $(element);
    if ($item.hasClass('show-more')) return;

    const tweetLink =
      $item.find('a.tweet-link').attr('href') ||
      $item.find('.tweet-date > a').attr('href') ||
      '';
    const statusId = extractStatusId(tweetLink);
    if (!statusId) return;

    const contentEl = $item.find('.tweet-content.media-body').first();
    let text = contentEl.text().trim();
    const quoteText = $item.find('.quote .quote-text').first().text().trim();
    if (quoteText) {
      text = text ? `${text}\n\n[Quote: ${quoteText}]` : quoteText;
    }
    if (!text) return;

    const dateTitle =
      $item.find('.tweet-date > a').attr('title') ||
      $item.find('.tweet-date > a').text();
    const username =
      normalizeHandle($item.find('.username').first().text()) || handle;

    tweets.push({
      handle: username,
      statusId,
      text,
      publishedAt: parseNitterDate(dateTitle),
    });
  });

  return tweets;
}

async function fetchTweetsViaHtml(
  handle: string,
  limit: number,
): Promise<RawTweet[]> {
  const pageUrl = `${XCANCEL_ORIGIN}/${handle}`;
  const { status, body } = await fetchText(pageUrl);

  if (isBotProtectionPage(body, status)) {
    throw new Error(
      `xcancel HTML blocked for @${handle} (HTTP ${status} / bot protection)`,
    );
  }
  if (status >= 400) {
    throw new Error(`xcancel HTML failed for @${handle} (HTTP ${status})`);
  }

  const tweets = parseTimelineHtml(handle, body, limit);
  if (tweets.length === 0) {
    throw new Error(`xcancel HTML timeline empty for @${handle}`);
  }
  return tweets;
}

/**
 * For one handle: try RSS first, then HTML `.timeline-item` fallback.
 */
export async function fetchTweetsForHandle(
  handle: string,
  limit: number,
): Promise<RawTweet[]> {
  try {
    return await fetchTweetsViaRss(handle, limit);
  } catch (rssErr) {
    const rssMessage = rssErr instanceof Error ? rssErr.message : String(rssErr);
    try {
      return await fetchTweetsViaHtml(handle, limit);
    } catch (htmlErr) {
      const htmlMessage =
        htmlErr instanceof Error ? htmlErr.message : String(htmlErr);
      throw new Error(
        `@${handle}: RSS failed (${rssMessage}); HTML failed (${htmlMessage})`,
      );
    }
  }
}

function tweetToArticle(
  tweet: RawTweet,
  fetchedAt: string,
): Omit<Article, 'id'> & { id?: string } {
  const xPermalink = toXPermalink(tweet.handle, tweet.statusId);
  const xcancelUrl = toXcancelStatusUrl(tweet.handle, tweet.statusId);

  return {
    title: truncateTitle(tweet.text),
    sourceKind: 'xcancel',
    canonicalUrl: xPermalink,
    citations: citationsFromXcancel(xcancelUrl, xPermalink),
    publisherUrl: null,
    publisherDomain: null,
    handle: tweet.handle,
    publishedAt: tweet.publishedAt,
    snippet: tweet.text,
    fetchedAt,
    classification: null,
    classifiedAt: null,
    classifyError: null,
  };
}

/**
 * Fetch tweets for configured xcancel handles (RSS-first, HTML fallback).
 * Empty handle list: no-op success (CFP-only). Failures land in meta.lastError.
 */
export async function fetchXcancelArticles(
  options: XcancelFetchOptions = {},
): Promise<XcancelFetchResult> {
  const handles = await resolveXcancelHandles(options.handles);
  const perProfileLimit = resolvePerProfileLimit(options.perProfileLimit);
  const delayMs = resolveDelayMs(options.delayMs);
  const fetchedAt = new Date().toISOString();

  if (handles.length === 0) {
    return {
      fetched: 0,
      upserted: [],
      handles: [],
      perProfileLimit,
      skipped: true,
      errors: [],
    };
  }

  const articles: Array<Omit<Article, 'id'> & { id?: string }> = [];
  const errors: string[] = [];

  try {
    for (let i = 0; i < handles.length; i += 1) {
      const handle = handles[i]!;
      if (i > 0 && delayMs > 0) {
        await sleep(delayMs);
      }
      try {
        const tweets = await fetchTweetsForHandle(handle, perProfileLimit);
        for (const tweet of tweets) {
          articles.push(tweetToArticle(tweet, fetchedAt));
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    const upserted =
      articles.length > 0 ? await upsertArticles(articles) : [];

    if (errors.length > 0) {
      const message = errors.join('; ');
      await updateMeta({ lastError: message });
      if (upserted.length === 0) {
        throw new Error(message);
      }
    } else {
      await updateMeta({ lastFetchAt: fetchedAt, lastError: null });
    }

    return {
      fetched: articles.length,
      upserted,
      handles,
      perProfileLimit,
      skipped: false,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateMeta({ lastError: message });
    throw err;
  }
}
