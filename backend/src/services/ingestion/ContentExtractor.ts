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

export interface ExtractedContent {
  title: string;
  textContent: string;
  htmlContent: string;
  excerpt: string;
  byline?: string;
  siteName?: string;
  length: number;
}

export class ContentExtractor {
  private timeout: number = 15000; // 15 seconds
  private maxContentLength: number = 100000; // 100KB max

  /**
   * Extract clean article content from a URL
   */
  async extractFromUrl(url: string): Promise<ExtractedContent | null> {
    try {
      // Fetch the HTML
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregatorBot/1.0)',
        },
        timeout: this.timeout,
        maxContentLength: this.maxContentLength,
      });

      // Parse with Readability
      return await this.extractFromHtml(html, url);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.warn(`Content extraction failed for ${url}:`, error.message);
      } else {
        console.warn(`Content extraction error for ${url}:`, error);
      }
      return null;
    }
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

      // Use Readability to extract article
      const reader = new Readability(document, {
        charThreshold: 500, // Minimum text length to consider it an article
      });

      const article = reader.parse();

      if (!article) {
        console.warn(`Readability could not extract article from ${url}`);
        return null;
      }

      // Handle potentially null/undefined values from Readability
      return {
        title: article.title || '',
        textContent: (article.textContent || '').trim(),
        htmlContent: article.content || '',
        excerpt: article.excerpt || '',
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
        length: article.length || 0,
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
}

// Export singleton instance
export const contentExtractor = new ContentExtractor();

