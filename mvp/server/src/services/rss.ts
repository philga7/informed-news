import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: [['content:encoded', 'content']],
  },
});

export type RssItem = {
  title: string;
  link: string;
  snippet: string;
  publishedAt: string | null;
};

/**
 * Fix unescaped ampersands that are not part of valid XML entities.
 */
export function preprocessXml(xmlText: string): string {
  return xmlText.replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi,
    '&amp;',
  );
}

/**
 * Extract an RSS alternate link from an HTML page.
 */
export function extractRssFeedFromHtml(html: string, baseUrl: string): string | null {
  const match = html.match(
    /<link[^>]*rel=["']alternate["'][^>]*type=["']application\/rss\+xml["'][^>]*href=["']([^"']+)["']/i,
  );
  const href = match?.[1];
  if (!href) return null;

  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Fetch and parse an RSS feed. If the URL returns HTML, discover the feed link.
 */
export async function parseRssFeed(url: string): Promise<RssItem[]> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Informed News MVP' },
  });
  if (!response.ok) {
    throw new Error(`RSS fetch failed (${response.status}) for ${url}`);
  }

  const rawText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const trimmed = rawText.trim();
  const isHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.toLowerCase().startsWith('<html') ||
    contentType.includes('text/html');

  if (isHtml) {
    const feedUrl = extractRssFeedFromHtml(rawText, url);
    if (!feedUrl) {
      throw new Error(
        'URL points to HTML but no RSS feed link found. Use a /feed/ or /rss/ URL.',
      );
    }
    return parseRssFeed(feedUrl);
  }

  const feed = await parser.parseString(preprocessXml(rawText));
  const items: RssItem[] = [];

  for (const item of feed.items) {
    if (!item.title || !item.link) continue;
    const anyItem = item as unknown as { description?: string };
    const snippet =
      item.contentSnippet ||
      item.content ||
      anyItem.description ||
      '';

    items.push({
      title: item.title,
      link: item.link,
      snippet: String(snippet),
      publishedAt: item.isoDate || item.pubDate || null,
    });
  }

  return items;
}
