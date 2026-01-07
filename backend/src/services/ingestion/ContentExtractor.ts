/**
 * Content Extractor Service
 * 
 * Extracts clean, readable content from web pages using Mozilla's Readability library.
 * This is used to get full article text for AI analysis instead of just RSS summaries.
 * 
 * Note: jsdom is dynamically imported to avoid loading it in serverless environments
 * where it has dependency conflicts. Content extraction will only work when jsdom
 * can be successfully loaded.
 */

import { Readability } from '@mozilla/readability';
import axios from 'axios';

// Dynamic import for jsdom to avoid loading it at module initialization
let JSDOM: typeof import('jsdom').JSDOM | null = null;

async function getJSDOM() {
  if (!JSDOM) {
    try {
      const jsdomModule = await import('jsdom');
      JSDOM = jsdomModule.JSDOM;
    } catch (error) {
      console.error('Failed to load jsdom:', error);
      throw new Error('jsdom is not available - content extraction disabled');
    }
  }
  return JSDOM;
}

export interface Link {
  url: string;
  text: string;
  context?: string;
}

export interface ExtractedContent {
  title: string;
  textContent: string;
  htmlContent: string;
  excerpt: string;
  byline?: string;
  siteName?: string;
  length: number;
  links: Link[]; // NEW: Extracted links from content
  headings: string[]; // NEW: Extracted headings from HTML
}

export interface ExtractionResult {
  content: ExtractedContent | null;
  errorCode?: number; // HTTP status code if extraction failed (e.g., 403, 404)
}

export class ContentExtractor {
  private timeout: number = 15000; // 15 seconds
  private maxContentLength: number = 100000; // 100KB max

  /**
   * Extract clean article content from a URL
   * Returns extraction result with error code if extraction failed
   */
  async extractFromUrl(url: string): Promise<ExtractionResult> {
    try {
      // Fetch the HTML with better headers to avoid some bot detection
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: this.timeout,
        maxContentLength: this.maxContentLength,
        validateStatus: (status) => status < 500, // Don't throw on 403, 404, etc.
      });

      // Check for error status codes
      if (response.status === 403) {
        console.warn(`Content extraction blocked for ${url}: HTTP 403 - Site may require authentication or block automated access`);
        return { content: null, errorCode: 403 };
      }
      if (response.status === 404) {
        console.warn(`Content extraction failed for ${url}: HTTP 404 - Page not found`);
        return { content: null, errorCode: 404 };
      }
      if (response.status >= 400) {
        console.warn(`Content extraction failed for ${url}: HTTP ${response.status}`);
        return { content: null, errorCode: response.status };
      }

      // Parse with Readability
      const extracted = await this.extractFromHtml(response.data, url);
      return { content: extracted };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        if (statusCode === 403) {
          console.warn(`Content extraction blocked for ${url}: HTTP 403 - Site may require authentication or block automated access`);
          return { content: null, errorCode: 403 };
        } else if (statusCode === 404) {
          console.warn(`Content extraction failed for ${url}: HTTP 404 - Page not found`);
          return { content: null, errorCode: 404 };
        } else if (statusCode) {
          console.warn(`Content extraction failed for ${url}: HTTP ${statusCode}`);
          return { content: null, errorCode: statusCode };
        } else {
          console.warn(`Content extraction failed for ${url}:`, error.message);
        }
      } else {
        console.warn(`Content extraction error for ${url}:`, error);
      }
      return { content: null };
    }
  }

  /**
   * Extract links from HTML
   */
  async extractLinks(html: string, baseUrl: string): Promise<Link[]> {
    try {
      const JSDOMClass = await getJSDOM();
      const dom = new JSDOMClass(html, { url: baseUrl });
      const document = dom.window.document;

      const links: Link[] = [];
      const anchorTags = document.querySelectorAll('a[href]');

      // Filter out navigation, footer, and ad links
      const skipPatterns = [
        /^(#|javascript:|mailto:|tel:)/i,
        /(nav|menu|footer|header|sidebar|ad|advertisement|cookie|privacy|terms)/i,
      ];

      anchorTags.forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href) return;

        // Skip navigation/footer/ad links
        if (skipPatterns.some(pattern => pattern.test(href))) return;

        try {
          // Resolve relative URLs to absolute
          const absoluteUrl = new URL(href, baseUrl).href;
          
          // Get link text
          const linkText = (anchor.textContent || '').trim();
          if (!linkText) return; // Skip empty links

          // Get context (250 chars before and after)
          const contextLength = 250;
          let context: string | undefined;
          
          const parent = anchor.parentElement;
          if (parent) {
            const parentText = parent.textContent || '';
            const linkIndex = parentText.indexOf(linkText);
            if (linkIndex >= 0) {
              const start = Math.max(0, linkIndex - contextLength);
              const end = Math.min(parentText.length, linkIndex + linkText.length + contextLength);
              context = parentText.substring(start, end).trim();
            }
          }

          links.push({
            url: absoluteUrl,
            text: linkText,
            context: context && context.length > linkText.length ? context : undefined,
          });
        } catch (urlError) {
          // Skip invalid URLs
          console.debug(`Skipping invalid link: ${href}`);
        }
      });

      return links;
    } catch (error) {
      console.warn(`Link extraction error for ${baseUrl}:`, error);
      return [];
    }
  }

  /**
   * Extract headings from HTML
   */
  private extractHeadings(document: Document): string[] {
    const headings: string[] = [];
    const headingTags = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    headingTags.forEach((heading) => {
      const text = (heading.textContent || '').trim();
      if (text) {
        headings.push(text);
      }
    });

    return headings;
  }

  /**
   * Extract content from HTML string
   */
  async extractFromHtml(html: string, url: string): Promise<ExtractedContent | null> {
    try {
      // Dynamically load jsdom
      const JSDOMClass = await getJSDOM();
      
      // Create DOM from HTML
      const dom = new JSDOMClass(html, { url });
      const document = dom.window.document;

      // Extract links before Readability processes the document
      const links = await this.extractLinks(html, url);

      // Use Readability to extract article
      const reader = new Readability(document, {
        charThreshold: 500, // Minimum text length to consider it an article
      });

      const article = reader.parse();

      if (!article) {
        console.warn(`Readability could not extract article from ${url}`);
        return null;
      }

      // Extract headings from original document
      const headings = this.extractHeadings(document);

      // Handle potentially null/undefined values from Readability
      return {
        title: article.title || '',
        textContent: (article.textContent || '').trim(),
        htmlContent: article.content || '',
        excerpt: article.excerpt || '',
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
        length: article.length || 0,
        links,
        headings,
      };
    } catch (error) {
      console.warn(`HTML parsing error for ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract just the text content (no HTML)
   * Returns null if extraction fails
   */
  async extractTextOnly(url: string): Promise<string | null> {
    const content = await this.extractFromUrl(url);
    return content ? content.textContent : null;
  }

  /**
   * Extract video content (title only)
   * For videos, we only extract the title from the page
   * No transcript extraction or storage
   */
  async extractVideoContent(url: string): Promise<string | null> {
    try {
      // Fetch the HTML
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregatorBot/1.0)',
        },
        timeout: this.timeout,
        maxContentLength: this.maxContentLength,
      });

      // Dynamically load jsdom
      const JSDOMClass = await getJSDOM();
      const dom = new JSDOMClass(html, { url });
      const document = dom.window.document;

      // Try to extract title from various meta tags (common for video platforms)
      const title =
        document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
        document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
        document.querySelector('title')?.textContent ||
        null;

      return title ? title.trim() : null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.warn(`Video title extraction failed for ${url}:`, error.message);
      } else {
        console.warn(`Video title extraction error for ${url}:`, error);
      }
      return null;
    }
  }

}

// Export singleton instance
export const contentExtractor = new ContentExtractor();

