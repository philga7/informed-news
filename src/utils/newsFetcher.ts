import type { NewsArticle, NewsSource, RSSFeedItem } from '../types';

export async function parseRSSFeed(url: string): Promise<RSSFeedItem[]> {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    const items: RSSFeedItem[] = [];
    const itemElements = xml.querySelectorAll('item, entry');

    itemElements.forEach((item) => {
      const title = item.querySelector('title')?.textContent || '';
      const description =
        item.querySelector('description')?.textContent ||
        item.querySelector('summary')?.textContent ||
        '';
      const link =
        item.querySelector('link')?.textContent ||
        item.querySelector('link')?.getAttribute('href') ||
        '';
      const pubDate =
        item.querySelector('pubDate')?.textContent ||
        item.querySelector('published')?.textContent ||
        new Date().toISOString();
      const author =
        item.querySelector('author')?.textContent ||
        item.querySelector('creator')?.textContent ||
        '';
      const content =
        item.querySelector('content, content\\:encoded')?.textContent || '';
      const thumbnail =
        item.querySelector('media\\:thumbnail')?.getAttribute('url') ||
        item.querySelector('enclosure[type^="image"]')?.getAttribute('url') ||
        '';

      if (title && link) {
        items.push({
          title,
          description,
          link,
          pubDate,
          author,
          content,
          thumbnail,
        });
      }
    });

    return items;
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
    throw new Error('Failed to parse RSS feed');
  }
}

export async function fetchFromManualUrl(url: string): Promise<Partial<NewsArticle>> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const title =
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      doc.querySelector('title')?.textContent ||
      'Untitled Article';

    const description =
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      '';

    const imageUrl =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
      undefined;

    const author =
      doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
      undefined;

    const publishedDate =
      doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      doc.querySelector('time')?.getAttribute('datetime') ||
      new Date().toISOString();

    return {
      title,
      description,
      url,
      imageUrl,
      author,
      publishedAt: new Date(publishedDate),
    };
  } catch (error) {
    console.error('Error fetching manual URL:', error);
    throw new Error('Failed to fetch article from URL');
  }
}

export async function fetchNewsFromSource(source: NewsSource): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  try {
    if (source.type === 'rss') {
      const items = await parseRSSFeed(source.url);

      items.forEach((item) => {
        articles.push({
          id: `${source.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: item.title,
          description: item.description,
          url: item.link,
          imageUrl: item.thumbnail || undefined,
          author: item.author || undefined,
          publishedAt: new Date(item.pubDate),
          source: source.name,
          sourceId: source.id,
          content: item.content || undefined,
          isRead: false,
          isFavorite: false,
          fetchedAt: new Date(),
        });
      });
    } else if (source.type === 'manual' || source.type === 'scrape') {
      const articleData = await fetchFromManualUrl(source.url);

      articles.push({
        id: `${source.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: articleData.title || 'Untitled',
        description: articleData.description || '',
        url: articleData.url || source.url,
        imageUrl: articleData.imageUrl,
        author: articleData.author,
        publishedAt: articleData.publishedAt || new Date(),
        source: source.name,
        sourceId: source.id,
        isRead: false,
        isFavorite: false,
        fetchedAt: new Date(),
      });
    }

    return articles;
  } catch (error) {
    console.error(`Error fetching from source ${source.name}:`, error);
    throw error;
  }
}

export async function fetchAllNews(sources: NewsSource[]): Promise<{
  articles: NewsArticle[];
  errors: { sourceId: string; message: string }[];
}> {
  const enabledSources = sources.filter(s => s.enabled);
  const articles: NewsArticle[] = [];
  const errors: { sourceId: string; message: string }[] = [];

  await Promise.allSettled(
    enabledSources.map(async (source) => {
      try {
        const sourceArticles = await fetchNewsFromSource(source);
        articles.push(...sourceArticles);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ sourceId: source.id, message: errorMessage });
      }
    })
  );

  return { articles, errors };
}
