/**
 * Content Extractor Service
 * 
 * Extracts clean, readable content from web pages using Mozilla's Readability library.
 * This is used to get full article text for AI analysis instead of just RSS summaries.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import axios from 'axios';

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
      return this.extractFromHtml(html, url);
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
  extractFromHtml(html: string, url: string): ExtractedContent | null {
    try {
      // Create DOM from HTML
      const dom = new JSDOM(html, { url });
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

      return {
        title: article.title,
        textContent: article.textContent.trim(),
        htmlContent: article.content,
        excerpt: article.excerpt,
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
        length: article.length,
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

