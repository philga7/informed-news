/**
 * Analysis Service
 * 
 * Frontend service for AI-assisted analysis of source records.
 * All AI outputs require human verification.
 */

import { apiClient } from '../utils/apiClient';
import type { DuplicateGroup } from '../types/osint';

export interface AnalyticArtifact {
  id: string;
  source_record_id: string | null;
  topic_id: string | null;
  organization_id: string;
  type: 'summary' | 'entity_extraction' | 'tone_analysis' | 'sentiment' | 'key_facts' | 'timeline' | 'network_graph' | 'media_comparison' | 'notes';
  payload: any;
  model_name: string;
  reviewed: boolean;
  created_by: string;
  created_at: string;
}

export interface SummaryPayload {
  summary: string;
  bulletPoints: string[];
  warning?: string; // Optional warning message (e.g., for 403 errors)
}

export interface EntityExtractionPayload {
  people: string[];
  organizations: string[];
  locations: string[];
  dates: string[];
  warning?: string; // Optional warning message (e.g., for 403 errors)
}

export interface ToneAnalysisPayload {
  overallTone: 'neutral' | 'opinion' | 'propaganda' | 'factual' | 'sensational';
  confidence: number; // Weighted confidence (0.0 to 1.0)
  rawConfidence?: number; // Original confidence before weighting (for reference)
  indicators: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  biasSignals: string[];
  warning?: string; // Optional warning message (e.g., for 403 errors)
}

export interface KeyFactsPayload {
  facts: Array<{
    fact: string;
    confidence: number;
    category?: 'event' | 'quote' | 'statistic' | 'claim';
    supportingLinks?: string[];
  }>;
  warning?: string; // Optional warning message (e.g., for 403 errors)
}

export interface TopicSummaryPayload {
  executiveSummary: string;
  keyDevelopments: string[];
  conflictingPerspectives?: string[];
  timelineHighlights?: string[];
  corroboratedClaims?: Array<{
    claim: string;
    sources: string[];
    sourceCount: number;
  }>;
  recommendedNextSteps?: string[];
  crossSourceLinks?: Array<{
    url: string;
    mentionedIn: string[];
  }>;
  unreviewedRecords?: Array<{
    title: string;
    sourceName: string;
    note: string;
  }>;
}

export interface MediaComparisonPayload {
  coverageAnalysis: {
    uniqueToArticles: string[];
    uniqueToVideos: string[];
    uniqueToPodcasts: string[];
    commonThemes: string[];
  };
  perspectiveDifferences: Array<{
    topic: string;
    articlePerspective: string;
    videoPerspective: string;
    podcastPerspective?: string;
  }>;
  emphasisAnalysis: {
    articleEmphasis: string[];
    videoEmphasis: string[];
    podcastEmphasis?: string[];
  };
  linkAnalysis: {
    sharedLinks: string[];
    mediaSpecificLinks: {
      articles: string[];
      videos: string[];
      podcasts: string[];
    };
  };
}

class AnalysisService {
  private baseUrl = '/api/analysis';

  /**
   * Generate AI-assisted summary for a source record
   */
  async generateSummary(sourceRecordId: string, fetchFreshContent: boolean = false): Promise<AnalyticArtifact> {
    const response = await apiClient.post(
      `${this.baseUrl}/source-records/${sourceRecordId}/summarize`,
      { fetchFreshContent }
    );
    return response.artifact;
  }

  /**
   * Extract entities from a source record
   */
  async extractEntities(sourceRecordId: string, fetchFreshContent: boolean = false): Promise<AnalyticArtifact> {
    const response = await apiClient.post(
      `${this.baseUrl}/source-records/${sourceRecordId}/entities`,
      { fetchFreshContent }
    );
    return response.artifact;
  }

  /**
   * Analyze tone and bias in a source record
   */
  async analyzeTone(sourceRecordId: string, fetchFreshContent: boolean = false): Promise<AnalyticArtifact> {
    const response = await apiClient.post(
      `${this.baseUrl}/source-records/${sourceRecordId}/tone`,
      { fetchFreshContent }
    );
    return response.artifact;
  }

  /**
   * Get all artifacts for a source record
   */
  async getArtifactsForSourceRecord(sourceRecordId: string): Promise<AnalyticArtifact[]> {
    const response = await apiClient.get(
      `${this.baseUrl}/source-records/${sourceRecordId}/artifacts`
    );
    return response.artifacts || [];
  }

  /**
   * Update artifact review status
   */
  async updateArtifactReview(artifactId: string, reviewed: boolean, notesContent?: string): Promise<AnalyticArtifact> {
    const body: any = { reviewed };
    if (notesContent !== undefined) {
      body.notes = notesContent;
    }
    const response = await apiClient.patch(
      `${this.baseUrl}/artifacts/${artifactId}`,
      body
    );
    return response.artifact;
  }

  /**
   * Delete an artifact
   */
  async deleteArtifact(artifactId: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/artifacts/${artifactId}`);
  }

  /**
   * Get all artifacts for a topic
   */
  async getTopicArtifacts(topicId: string): Promise<AnalyticArtifact[]> {
    const response = await apiClient.get(`${this.baseUrl}/topics/${topicId}/artifacts`);
    return response.artifacts || [];
  }

  /**
   * Get aggregated tone analysis for a topic (combines all linked source records)
   */
  async getTopicToneAggregate(topicId: string): Promise<{
    topicId: string;
    aggregate: {
      overallTone: string;
      toneDistribution: Record<string, number>;
      sentiment: string;
      sentimentDistribution: Record<string, number>;
      confidence: number;
      rawConfidence: number;
      indicators: string[];
      biasSignals: string[];
      sourceRecordCount: number;
      analysisCount: number;
    } | null;
    message?: string;
  }> {
    const response = await apiClient.get(`${this.baseUrl}/topics/${topicId}/tone-aggregate`);
    return response;
  }

  /**
   * Detect near-duplicate content across source records
   */
  async detectDuplicates(params: {
    topicId?: string;
    organizationId: string;
  }): Promise<DuplicateGroup[]> {
    const response = await apiClient.post(
      `${this.baseUrl}/detect-duplicates`,
      {
        topic_id: params.topicId,
        organization_id: params.organizationId,
      }
    );
    return response.duplicate_groups || [];
  }

  /**
   * Save analyst assessment of potential coordination
   */
  async saveCoordinationAssessment(params: {
    duplicateGroupHash: string;
    assessment: string;
    organizationId: string;
    assessedByUserId?: string;
  }): Promise<AnalyticArtifact> {
    const response = await apiClient.post(
      `${this.baseUrl}/coordination-assessments`,
      {
        duplicate_group_hash: params.duplicateGroupHash,
        assessment: params.assessment,
        organization_id: params.organizationId,
        assessed_by_user_id: params.assessedByUserId,
      }
    );
    return response.artifact;
  }

  /**
   * Extract key facts from a source record
   */
  async extractKeyFacts(sourceRecordId: string, fetchFreshContent: boolean = false): Promise<AnalyticArtifact> {
    const response = await apiClient.post(
      `${this.baseUrl}/source-records/${sourceRecordId}/key-facts`,
      { fetchFreshContent }
    );
    return response.artifact;
  }

  /**
   * Generate topic-level summary across all linked source records
   * Uses stored content from linked source records (no fresh content fetching)
   */
  async generateTopicSummary(topicId: string): Promise<AnalyticArtifact> {
    const response = await apiClient.post(
      `${this.baseUrl}/topics/${topicId}/summarize`
    );
    return response.artifact;
  }

  /**
   * Compare content across different media types for a topic
   */
  async compareMediaTypes(topicId: string): Promise<AnalyticArtifact> {
    const response = await apiClient.post(
      `${this.baseUrl}/topics/${topicId}/compare-media`
    );
    return response.artifact;
  }

  /**
   * Create or update a notes artifact for a source record
   */
  async createNotes(sourceRecordId: string, notes: string): Promise<AnalyticArtifact> {
    const response = await apiClient.post(
      `${this.baseUrl}/source-records/${sourceRecordId}/notes`,
      { notes }
    );
    return response.artifact;
  }

  /**
   * Update notes artifact content
   */
  async updateNotes(artifactId: string, notes: string): Promise<AnalyticArtifact> {
    const response = await apiClient.patch(
      `${this.baseUrl}/artifacts/${artifactId}/notes`,
      { notes }
    );
    return response.artifact;
  }
}

export const analysisService = new AnalysisService();

