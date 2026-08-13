/**
 * Media Type Detector Service
 * 
 * Detects media type from URLs, metadata, and platform-specific patterns.
 * Supports articles, videos, podcasts, audio, and other media types.
 */

import axios from 'axios';
import type { ExtractedContent } from './ContentExtractor.js';

export type MediaType = 'article' | 'video' | 'podcast' | 'audio' | 'other';

export interface MediaMetadata {
  mediaType: MediaType;
  platform?: string;
  duration?: number;
  thumbnail?: string;
}

export class MediaTypeDetector {
  private readonly VIDEO_PATTERNS = [
    /youtube\.com/i,
    /youtu\.be/i,
    /vimeo\.com/i,
    /dailymotion\.com/i,
    /twitch\.tv/i,
    /tiktok\.com/i,
  ];

  private readonly PODCAST_PATTERNS = [
    /podcast/i,
    /spotify\.com.*episode/i,
    /anchor\.fm/i,
    /podbean\.com/i,
    /stitcher\.com/i,
    /pocketcasts\.com/i,
  ];

  private readonly AUDIO_PATTERNS = [
    /\.mp3$/i,
    /\.wav$/i,
    /\.m4a$/i,
    /\.ogg$/i,
    /\.flac$/i,
    /soundcloud\.com/i,
    /bandcamp\.com/i,
  ];

  /**
   * Detect media type from URL
   */
  detectFromUrl(url: string): MediaType {
    if (!url) return 'article';

    // Check video patterns
    if (this.VIDEO_PATTERNS.some(pattern => pattern.test(url))) {
      return 'video';
    }

    // Check podcast patterns
    if (this.PODCAST_PATTERNS.some(pattern => pattern.test(url))) {
      return 'podcast';
    }

    // Check audio patterns
    if (this.AUDIO_PATTERNS.some(pattern => pattern.test(url))) {
      return 'audio';
    }

    // Default to article
    return 'article';
  }

  /**
   * Detect media type from metadata
   */
  detectFromMetadata(metadata: Record<string, any>): MediaType {
    if (!metadata) return 'article';

    // Check RSS feed metadata
    if (metadata.rss_item) {
      const enclosure = metadata.rss_item.enclosure;
      if (enclosure) {
        const type = enclosure.type?.toLowerCase() || '';
        if (type.includes('video')) return 'video';
        if (type.includes('audio') || type.includes('podcast')) {
          // Distinguish between podcast and audio
          if (type.includes('podcast') || metadata.rss_item.itunes) {
            return 'podcast';
          }
          return 'audio';
        }
      }
    }

    // Check for explicit media type in metadata
    if (metadata.media_type) {
      const mediaType = metadata.media_type.toLowerCase();
      if (['video', 'podcast', 'audio', 'article', 'other'].includes(mediaType)) {
        return mediaType as MediaType;
      }
    }

    // Check og:type meta tag
    if (metadata.og_type) {
      const ogType = metadata.og_type.toLowerCase();
      if (ogType.includes('video')) return 'video';
      if (ogType.includes('audio')) return 'audio';
    }

    return 'article';
  }

  /**
   * Extract media metadata from URL
   */
  async extractMediaMetadata(url: string, mediaType: MediaType): Promise<MediaMetadata> {
    const metadata: MediaMetadata = {
      mediaType,
    };

    try {
      // For videos, try to extract platform and thumbnail
      if (mediaType === 'video') {
        // Extract platform
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          metadata.platform = 'youtube';
        } else if (url.includes('vimeo.com')) {
          metadata.platform = 'vimeo';
        } else if (url.includes('dailymotion.com')) {
          metadata.platform = 'dailymotion';
        }

        // Try to fetch page and extract thumbnail from og:image
        try {
          const { data: html } = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregatorBot/1.0)',
            },
            timeout: 5000,
          });

          // Extract thumbnail from og:image meta tag
          const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
          if (ogImageMatch) {
            metadata.thumbnail = ogImageMatch[1];
          }
        } catch (fetchError) {
          // Silently fail - thumbnail extraction is optional
          console.debug(`Could not extract thumbnail for ${url}`);
        }
      }

      // For podcasts, extract platform
      if (mediaType === 'podcast') {
        if (url.includes('spotify.com')) {
          metadata.platform = 'spotify';
        } else if (url.includes('anchor.fm')) {
          metadata.platform = 'anchor';
        }
      }
    } catch (error) {
      console.debug(`Media metadata extraction error for ${url}:`, error);
    }

    return metadata;
  }

  /**
   * Detect media type from extracted content
   */
  detectFromContent(content: ExtractedContent | null, url: string, metadata?: Record<string, any>): MediaType {
    // First try metadata
    if (metadata) {
      const fromMetadata = this.detectFromMetadata(metadata);
      if (fromMetadata !== 'article') {
        return fromMetadata;
      }
    }

    // Then try URL
    const fromUrl = this.detectFromUrl(url);
    if (fromUrl !== 'article') {
      return fromUrl;
    }

    // Default to article
    return 'article';
  }
}

// Export singleton instance
export const mediaTypeDetector = new MediaTypeDetector();

