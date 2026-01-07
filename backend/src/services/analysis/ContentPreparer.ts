/**
 * Content Preparer Service
 * 
 * Prepares content for genAI analysis with metadata, links, and structure.
 * Handles content decompression, link extraction, and video title-only analysis.
 */

import { supabase } from '../../utils/supabase.js';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { contentExtractor } from '../ingestion/ContentExtractor.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export type MediaType = 'article' | 'video' | 'podcast' | 'audio' | 'other';

export interface Link {
  url: string;
  text: string;
  context?: string;
}

export interface PreparedContent {
  text: string; // Main content (decompressed if needed, or title for videos)
  metadata: {
    author?: string;
    siteName?: string;
    publishedAt?: Date;
    excerpt?: string;
    url: string;
  };
  links: Link[];
  structure?: {
    headings: string[]; // H1-H6 headings
    wordCount: number;
  };
  mediaType: MediaType;
  analystNotes?: string[]; // Reviewed notes from analyst (additional context)
  contentExtractionError?: number; // HTTP status code if content extraction failed (e.g., 403)
}

interface SourceRecordRow {
  id: string;
  title: string;
  url: string | null;
  content: string | null;
  media_type: MediaType;
  content_type: string;
  content_compressed: boolean;
  content_length: number | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown> | null;
  sources: {
    name: string;
    reliability_rating: string;
  };
}

export class ContentPreparer {
  /**
   * Prepare content for analysis from a source record
   * @param recordId Source record ID
   * @param fetchFromUrl Optional URL to fetch fresh content from (if provided, fetches from URL instead of using stored content)
   */
  async prepareForAnalysis(recordId: string, fetchFromUrl?: string): Promise<PreparedContent> {
    // Fetch the source record with source information
    const { data: record, error } = await supabase
      .from('source_records')
      .select(`
        id,
        title,
        url,
        content,
        media_type,
        content_type,
        content_compressed,
        content_length,
        published_at,
        raw_metadata,
        sources!inner (
          name,
          reliability_rating
        )
      `)
      .eq('id', recordId)
      .single() as { data: SourceRecordRow | null; error: any };

    if (error || !record) {
      throw new Error(`Source record not found: ${recordId}`);
    }

    // For videos: Use title only (no transcript)
    if (record.media_type === 'video') {
      return {
        text: record.title || 'Untitled Video',
        metadata: {
          url: record.url || '',
          publishedAt: record.published_at ? new Date(record.published_at) : undefined,
          siteName: record.sources.name,
        },
        links: [],
        mediaType: 'video',
      };
    }

    // For articles: Use stored content or fetch fresh from URL
    let textContent = '';
    let extractedTitle: string | undefined;
    let useFreshContent = false;
    let extractedLinks: Link[] = [];

    // If fetchFromUrl is provided, fetch fresh content from URL
    let contentExtractionError: number | undefined;
    if (fetchFromUrl && record.media_type !== 'video') {
      try {
        const extractionResult = await contentExtractor.extractFromUrl(fetchFromUrl);
        if (extractionResult.content && extractionResult.content.textContent && extractionResult.content.textContent.trim().length > 0) {
          textContent = extractionResult.content.textContent;
          useFreshContent = true;
          // Use links from extracted content
          extractedLinks = extractionResult.content.links || [];
          // Update title if we got a better one from the page
          if (extractionResult.content.title && extractionResult.content.title.trim() && extractionResult.content.title !== record.title) {
            extractedTitle = extractionResult.content.title.trim();
          }
        } else {
          // Fall back to stored content if extraction fails
          if (extractionResult.errorCode) {
            contentExtractionError = extractionResult.errorCode;
            console.warn(`Failed to extract content from URL ${fetchFromUrl} (HTTP ${extractionResult.errorCode}), using stored content`);
          } else {
            console.warn(`Failed to extract content from URL ${fetchFromUrl}, using stored content`);
          }
        }
      } catch (extractError) {
        // Fall back to stored content if extraction fails
        console.warn(`Error extracting content from URL ${fetchFromUrl}:`, extractError);
      }
    }

    // If not using fresh content (or fetch failed), use stored content
    if (!useFreshContent) {
      // Decompress if needed
      if (record.content_compressed && record.content) {
        try {
          // Content is stored as base64-encoded gzip
          const compressedBuffer = Buffer.from(record.content, 'base64');
          const decompressed = await gunzipAsync(compressedBuffer);
          textContent = decompressed.toString('utf-8');
        } catch (decompressError) {
          console.warn(`Failed to decompress content for record ${recordId}:`, decompressError);
          // Fall back to compressed content (may be readable if not actually compressed)
          textContent = record.content || '';
        }
      } else {
        textContent = record.content || '';
      }
    }

    // Extract links: use extracted links if we fetched fresh content, otherwise use metadata links
    const links = useFreshContent && extractedLinks.length > 0
      ? extractedLinks
      : this.extractLinksFromMetadata(record.raw_metadata, record.url || '');

    // Extract headings from raw_metadata (if stored during ingestion)
    const headings = this.extractHeadingsFromMetadata(record.raw_metadata);

    // Extract metadata
    const metadata = this.extractMetadata(record, record.sources);
    
    // Use extracted title if available, otherwise use stored title
    if (extractedTitle) {
      metadata.siteName = extractedTitle;
    }

    // Calculate word count
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

    // Fetch reviewed notes artifacts for this source record
    const analystNotes = await this.fetchReviewedNotes(recordId);

    return {
      text: textContent || record.title || '',
      metadata,
      links,
      structure: headings.length > 0 || wordCount > 0 ? {
        headings,
        wordCount,
      } : undefined,
      mediaType: record.media_type as MediaType,
      analystNotes: analystNotes.length > 0 ? analystNotes : undefined,
      contentExtractionError,
    };
  }

  /**
   * Fetch reviewed notes artifacts for a source record
   */
  private async fetchReviewedNotes(sourceRecordId: string): Promise<string[]> {
    try {
      const { data: notesArtifacts, error } = await supabase
        .from('analytic_artifacts')
        .select('payload')
        .eq('source_record_id', sourceRecordId)
        .eq('type', 'notes')
        .eq('reviewed', true);

      if (error) {
        console.warn(`Failed to fetch reviewed notes for record ${sourceRecordId}:`, error);
        return [];
      }

      if (!notesArtifacts || notesArtifacts.length === 0) {
        return [];
      }

      // Extract notes content from payload
      return notesArtifacts
        .map((artifact: any) => {
          const payload = artifact.payload as { notes?: string };
          return payload?.notes?.trim();
        })
        .filter((notes: string | undefined): notes is string => Boolean(notes && notes.length > 0));
    } catch (error) {
      console.warn(`Error fetching reviewed notes for record ${sourceRecordId}:`, error);
      return [];
    }
  }

  /**
   * Extract links from raw_metadata
   */
  private extractLinksFromMetadata(
    rawMetadata: Record<string, unknown> | null,
    baseUrl: string
  ): Link[] {
    if (!rawMetadata || !rawMetadata.links) {
      return [];
    }

    const links = rawMetadata.links;
    if (!Array.isArray(links)) {
      return [];
    }

    return links
      .filter((link: any) => link && typeof link === 'object' && link.url)
      .map((link: any) => ({
        url: link.url || '',
        text: link.text || '',
        context: link.context || undefined,
      }))
      .filter((link: Link) => link.url && link.text);
  }

  /**
   * Extract headings from raw_metadata (if stored during ingestion)
   */
  private extractHeadingsFromMetadata(
    rawMetadata: Record<string, unknown> | null
  ): string[] {
    if (!rawMetadata || !rawMetadata.headings) {
      return [];
    }

    const headings = rawMetadata.headings;
    if (!Array.isArray(headings)) {
      return [];
    }

    return headings
      .filter((h: any) => typeof h === 'string' && h.trim().length > 0)
      .map((h: string) => h.trim());
  }

  /**
   * Extract metadata from record and source
   */
  private extractMetadata(
    record: SourceRecordRow,
    source: { name: string; reliability_rating: string }
  ): PreparedContent['metadata'] {
    const rawMetadata = record.raw_metadata || {};
    
    return {
      author: (rawMetadata.author as string) || (rawMetadata.byline as string) || undefined,
      siteName: (rawMetadata.siteName as string) || (rawMetadata.site_name as string) || source.name || undefined,
      publishedAt: record.published_at ? new Date(record.published_at) : undefined,
      excerpt: (rawMetadata.excerpt as string) || undefined,
      url: record.url || '',
    };
  }
}

export const contentPreparer = new ContentPreparer();

