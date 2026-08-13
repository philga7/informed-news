/**
 * X.com Tweets API Routes
 * 
 * Endpoints for creating Source Records from tweets captured in embedded timelines.
 * Part of Phase 10: Tweet Selection & Topic Creation.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import { auditService } from '../services/auditService.js';

const router = Router();

// ============================================================================
// TYPES
// ============================================================================

interface TweetData {
  text: string;
  authorUsername: string;
  tweetUrl: string;
  timestamp?: string;
  videoLinks?: string[];
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
}

interface CreateSourceRecordsRequest {
  organization_id: string;
  user_id?: string;
  tweets: TweetData[];
  combine_into_single?: boolean;
  topic_ids?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const XCOM_SOURCE_NAME = 'X.com';
const XCOM_SOURCE_TYPE = 'manual';
const XCOM_SOURCE_URL = 'https://x.com';
const XCOM_DOMAIN = 'social';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Helper function to extract user ID from request
 */
function getUserId(req: Request): string | null {
  return (req.body?.user_id as string) || null;
}

/**
 * Get or create the organization's X.com source
 */
async function getOrCreateXcomSource(organizationId: string): Promise<string> {
  // Look for existing X.com source
  // @ts-ignore - Supabase type inference issue
  const { data: existingSources, error: fetchError } = await supabase
    .from('sources')
    .select('id, name, source_type')
    .eq('organization_id', organizationId)
    .eq('source_type', XCOM_SOURCE_TYPE)
    .or(`name.eq.${XCOM_SOURCE_NAME},name.ilike.%x.com%,name.ilike.%twitter%`);

  if (fetchError) {
    console.error('Error fetching existing X.com source:', fetchError);
    throw new Error('Failed to check for existing X.com source');
  }

  // Return existing source if found
  if (existingSources && existingSources.length > 0) {
    return (existingSources[0] as any).id;
  }

  // Create new X.com source
  // @ts-ignore - Supabase type inference issue
  const { data: newSource, error: createError } = await supabase
    .from('sources')
    .insert({
      organization_id: organizationId,
      name: XCOM_SOURCE_NAME,
      source_type: XCOM_SOURCE_TYPE,
      url: XCOM_SOURCE_URL,
      domain: XCOM_DOMAIN,
      reliability_rating: 'MEDIUM',
      notes: 'Auto-created source for tweets captured from X.com embedded timelines.',
      enabled: true,
    } as any)
    .select('id')
    .single();

  if (createError) {
    console.error('Error creating X.com source:', createError);
    throw new Error('Failed to create X.com source');
  }

  return (newSource as any).id;
}

/**
 * Format tweet as Source Record title
 */
function formatTweetAsTitle(tweet: TweetData, maxLength: number = 100): string {
  if (tweet.text) {
    const truncated = tweet.text.length > maxLength 
      ? tweet.text.slice(0, maxLength - 3) + '...'
      : tweet.text;
    return truncated;
  }
  return `Tweet by @${tweet.authorUsername}`;
}

/**
 * Format tweet as Source Record content
 */
function formatTweetAsContent(tweet: TweetData): string {
  const parts: string[] = [];

  // Add tweet text
  if (tweet.text) {
    parts.push(tweet.text);
  }

  // Add metadata section
  parts.push('');
  parts.push('---');
  parts.push(`**Author:** @${tweet.authorUsername}`);
  parts.push(`**URL:** ${tweet.tweetUrl}`);
  
  if (tweet.timestamp) {
    parts.push(`**Posted:** ${tweet.timestamp}`);
  }

  // Add media info if present
  if (tweet.mediaUrls && tweet.mediaUrls.length > 0) {
    parts.push(`**Media:** ${tweet.mediaUrls.length} image(s)/media`);
  }

  if (tweet.videoLinks && tweet.videoLinks.length > 0) {
    parts.push(`**Video:** ${tweet.videoLinks.length} video(s)`);
  }

  return parts.join('\n');
}

/**
 * Format multiple tweets as combined Source Record content
 */
function formatMultipleTweetsAsContent(tweets: TweetData[]): string {
  const parts: string[] = [];

  tweets.forEach((tweet, index) => {
    if (index > 0) {
      parts.push('');
      parts.push('---');
      parts.push('');
    }

    parts.push(`## Tweet ${index + 1} by @${tweet.authorUsername}`);
    parts.push('');
    
    if (tweet.text) {
      parts.push(tweet.text);
    }
    
    parts.push('');
    parts.push(`**URL:** ${tweet.tweetUrl}`);
    
    if (tweet.timestamp) {
      parts.push(`**Posted:** ${tweet.timestamp}`);
    }
  });

  return parts.join('\n');
}

/**
 * Create a Source Record from tweet data
 */
async function createSourceRecord(
  sourceId: string,
  title: string,
  content: string,
  url: string,
  publishedAt?: string
): Promise<string> {
  // @ts-ignore - Supabase type inference issue
  const { data: record, error } = await supabase
    .from('source_records')
    .insert({
      source_id: sourceId,
      title,
      content,
      url,
      published_at: publishedAt || new Date().toISOString(),
      ingested_at: new Date().toISOString(),
      scan_status: 'pending',
      media_type: 'article',
      content_type: 'full_text',
    } as any)
    .select('id')
    .single();

  if (error) {
    console.error('Error creating source record:', error);
    throw new Error(`Failed to create source record: ${error.message}`);
  }

  return (record as any).id;
}

/**
 * Link a Source Record to a Topic
 */
async function linkRecordToTopic(
  topicId: string,
  sourceRecordId: string,
  userId?: string
): Promise<void> {
  // Check if link already exists
  // @ts-ignore - Supabase type inference issue
  const { data: existing, error: checkError } = await supabase
    .from('topic_source_links')
    .select('id')
    .eq('topic_id', topicId)
    .eq('source_record_id', sourceRecordId)
    .single();

  if (existing) {
    // Already linked
    return;
  }

  // @ts-ignore - Supabase type inference issue
  const { error } = await supabase
    .from('topic_source_links')
    .insert({
      topic_id: topicId,
      source_record_id: sourceRecordId,
      confidence_level: 'MEDIUM',
      linked_by_user_id: userId || null,
      linked_at: new Date().toISOString(),
      review_status: 'pending',
    } as any);

  if (error) {
    console.error('Error linking record to topic:', error);
    throw new Error(`Failed to link record to topic: ${error.message}`);
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/xcom-tweets/source-records
 * Create Source Records from tweets
 * Body: {
 *   organization_id: string (required)
 *   user_id?: string
 *   tweets: TweetData[] (required)
 *   combine_into_single?: boolean (default: false)
 *   topic_ids?: string[] (optional: Topics to link the records to)
 * }
 */
router.post('/source-records', async (req: Request, res: Response) => {
  try {
    const {
      organization_id,
      user_id,
      tweets,
      combine_into_single = false,
      topic_ids = [],
    } = req.body as CreateSourceRecordsRequest;

    // Validation
    if (!organization_id) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'organization_id is required',
      });
    }

    if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'tweets array is required and must not be empty',
      });
    }

    // Validate each tweet has required fields
    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];
      if (!tweet.tweetUrl) {
        return res.status(400).json({
          error: 'Validation failed',
          message: `Tweet at index ${i} is missing required field: tweetUrl`,
        });
      }
      if (!tweet.authorUsername) {
        return res.status(400).json({
          error: 'Validation failed',
          message: `Tweet at index ${i} is missing required field: authorUsername`,
        });
      }
    }

    // Get or create X.com source
    const sourceId = await getOrCreateXcomSource(organization_id);

    const createdRecordIds: string[] = [];
    const errors: string[] = [];

    if (combine_into_single && tweets.length > 1) {
      // Create single combined record
      try {
        const title = `Combined tweets (${tweets.length} tweets from X.com)`;
        const content = formatMultipleTweetsAsContent(tweets);
        const url = tweets[0].tweetUrl; // Use first tweet's URL as primary
        const publishedAt = tweets[0].timestamp;

        const recordId = await createSourceRecord(sourceId, title, content, url, publishedAt);
        createdRecordIds.push(recordId);

        // Log audit action
        await auditService.logSourceRecordCreated(recordId, {
          title,
          source_id: sourceId,
          media_type: 'article',
          content_type: 'full_text',
          content_length: content.length,
        }, user_id);

        // Link to topics if provided
        for (const topicId of topic_ids) {
          try {
            await linkRecordToTopic(topicId, recordId, user_id);
          } catch (linkError) {
            errors.push(`Failed to link record to topic ${topicId}: ${linkError instanceof Error ? linkError.message : 'Unknown error'}`);
          }
        }
      } catch (err) {
        errors.push(`Failed to create combined record: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } else {
      // Create individual records for each tweet
      for (const tweet of tweets) {
        try {
          const title = formatTweetAsTitle(tweet);
          const content = formatTweetAsContent(tweet);
          const url = tweet.tweetUrl;
          const publishedAt = tweet.timestamp;

          const recordId = await createSourceRecord(sourceId, title, content, url, publishedAt);
          createdRecordIds.push(recordId);

          // Log audit action
          await auditService.logSourceRecordCreated(recordId, {
            title,
            source_id: sourceId,
            media_type: 'article',
            content_type: 'full_text',
            content_length: content.length,
          }, user_id);

          // Link to topics if provided
          for (const topicId of topic_ids) {
            try {
              await linkRecordToTopic(topicId, recordId, user_id);
            } catch (linkError) {
              errors.push(`Failed to link record ${recordId} to topic ${topicId}: ${linkError instanceof Error ? linkError.message : 'Unknown error'}`);
            }
          }
        } catch (err) {
          errors.push(`Failed to create record for tweet by @${tweet.authorUsername}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    // Return result
    res.status(201).json({
      success: createdRecordIds.length > 0,
      recordIds: createdRecordIds,
      created: createdRecordIds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error creating source records from tweets:', error);
    res.status(500).json({
      error: 'Failed to create source records from tweets',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/xcom-tweets/source
 * Get the X.com source for an organization (creates if doesn't exist)
 * Query params: organization_id (required)
 */
router.get('/source', async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'organization_id is required',
      });
    }

    const sourceId = await getOrCreateXcomSource(organization_id as string);

    // Fetch the full source object
    const { data: source, error } = await supabase
      .from('sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      source,
    });
  } catch (error) {
    console.error('Error getting X.com source:', error);
    res.status(500).json({
      error: 'Failed to get X.com source',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
