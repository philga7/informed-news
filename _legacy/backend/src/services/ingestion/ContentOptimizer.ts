/**
 * Content Optimizer Service
 * 
 * Determines optimal content storage strategy based on source value,
 * content length, and usage patterns. Handles compression for large content.
 */

import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { ExtractedContent } from './ContentExtractor.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export type MediaType = 'article' | 'video' | 'podcast' | 'audio' | 'other';
export type ContentType = 'full_text' | 'summary' | 'structured' | 'minimal';

export interface ContentOptimizationStrategy {
  contentType: ContentType;
  shouldCompress: boolean;
  maxLength?: number;
}

export class ContentOptimizer {
  private readonly COMPRESSION_THRESHOLD = 50 * 1024; // 50KB
  private readonly LARGE_CONTENT_THRESHOLD = 100 * 1024; // 100KB
  private readonly SUMMARY_LENGTH = 2000; // 2KB
  private readonly EXCERPT_LENGTH = 10000; // 10KB

  /**
   * Determine storage strategy based on source value and content length
   */
  determineStrategy(
    sourceValue: number | null, // 1-5 rating
    contentLength: number,
    isLinkedToTopic: boolean,
    mediaType: MediaType
  ): ContentOptimizationStrategy {
    // Videos always use minimal (title only)
    if (mediaType === 'video') {
      return {
        contentType: 'minimal',
        shouldCompress: false,
      };
    }

    // Linked to topics: Always keep full content
    if (isLinkedToTopic) {
      return {
        contentType: 'full_text',
        shouldCompress: contentLength > this.COMPRESSION_THRESHOLD,
      };
    }

    // High-value sources (rating ≥ 4): Always store full_text
    if (sourceValue !== null && sourceValue >= 4) {
      return {
        contentType: 'full_text',
        shouldCompress: contentLength > this.COMPRESSION_THRESHOLD,
      };
    }

    // Low-value sources (rating ≤ 2): Store summary or minimal
    if (sourceValue !== null && sourceValue <= 2) {
      if (contentLength < 10 * 1024) {
        // Small content: store full
        return {
          contentType: 'full_text',
          shouldCompress: false,
        };
      }
      return {
        contentType: 'summary',
        shouldCompress: false,
        maxLength: this.SUMMARY_LENGTH,
      };
    }

    // Medium-value sources or no rating: Optimize based on length
    if (contentLength < 10 * 1024) {
      // < 10KB: Store full text
      return {
        contentType: 'full_text',
        shouldCompress: false,
      };
    } else if (contentLength < this.COMPRESSION_THRESHOLD) {
      // 10-50KB: Store full text, consider compression
      return {
        contentType: 'full_text',
        shouldCompress: false,
      };
    } else if (contentLength < this.LARGE_CONTENT_THRESHOLD) {
      // 50-100KB: Store first 20KB + summary + links, compress
      return {
        contentType: 'summary',
        shouldCompress: true,
        maxLength: 20 * 1024,
      };
    } else {
      // > 100KB: Store excerpt + first 10KB + full link list, compress
      return {
        contentType: 'minimal',
        shouldCompress: true,
        maxLength: this.EXCERPT_LENGTH,
      };
    }
  }

  /**
   * Optimize content based on strategy
   */
  optimizeContent(
    extracted: ExtractedContent,
    strategy: ContentOptimizationStrategy
  ): string {
    let optimized: string;

    switch (strategy.contentType) {
      case 'minimal':
        // Return only excerpt or title
        optimized = extracted.excerpt || extracted.title;
        break;
      case 'summary':
        // Return excerpt + first N chars (avoid duplication if excerpt is already in text)
        const maxLen = strategy.maxLength || this.SUMMARY_LENGTH;
        const excerpt = extracted.excerpt || '';
        let textStart = extracted.textContent;
        
        // Check if excerpt is already at the beginning of textContent to avoid duplication
        if (excerpt && textStart.toLowerCase().startsWith(excerpt.toLowerCase().trim())) {
          // Excerpt is already in text, just use the text
          optimized = textStart.substring(0, maxLen);
        } else if (excerpt) {
          // Excerpt is separate, combine them
          const availableLength = maxLen - excerpt.length - 2; // -2 for '\n\n'
          textStart = extracted.textContent.substring(0, Math.max(0, availableLength));
          optimized = `${excerpt}\n\n${textStart}`;
        } else {
          // No excerpt, just use text
          optimized = textStart.substring(0, maxLen);
        }
        break;
      case 'structured':
        // Return HTML content
        optimized = extracted.htmlContent;
        break;
      case 'full_text':
      default:
        // Apply maxLength if specified
        if (strategy.maxLength && extracted.textContent.length > strategy.maxLength) {
          optimized = extracted.textContent.substring(0, strategy.maxLength);
        } else {
          optimized = extracted.textContent;
        }
        break;
    }

    return optimized;
  }

  /**
   * Compress content if needed
   */
  async compressContent(content: string): Promise<{ compressed: Buffer; originalLength: number }> {
    const originalLength = Buffer.byteLength(content, 'utf8');
    const compressed = await gzipAsync(Buffer.from(content, 'utf8'));
    return { compressed, originalLength };
  }

  /**
   * Decompress content for analysis
   */
  async decompressContent(compressed: Buffer): Promise<string> {
    const decompressed = await gunzipAsync(compressed);
    return decompressed.toString('utf8');
  }
}

// Export singleton instance
export const contentOptimizer = new ContentOptimizer();

