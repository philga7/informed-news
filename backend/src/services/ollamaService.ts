import { Ollama } from 'ollama';
import type { PreparedContent, Link, MediaType } from './analysis/ContentPreparer.js';

/**
 * OllamaService
 * 
 * Provides AI-assisted analysis using Ollama Cloud API.
 * All outputs are suggestions and require human verification.
 */

export interface SummarizeResponse {
  summary: string;
  bulletPoints: string[];
}

export interface EntityExtractionResponse {
  people: string[];
  organizations: string[];
  locations: string[];
  dates: string[];
}

export interface ToneAnalysisResponse {
  overallTone: 'neutral' | 'opinion' | 'propaganda' | 'factual' | 'sensational';
  confidence: number; // Weighted confidence (0.0 to 1.0)
  rawConfidence?: number; // Original confidence before weighting (for reference)
  indicators: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  biasSignals: string[];
}

export interface KeyFactsResponse {
  facts: Array<{
    fact: string;
    confidence: number;
    category?: 'event' | 'quote' | 'statistic' | 'claim';
    supportingLinks?: string[];
  }>;
}

export interface TopicSummaryResponse {
  executiveSummary: string;
  keyDevelopments: string[];
  conflictingPerspectives?: string[];
  timelineHighlights?: string[];
  recommendedNextSteps?: string[];
  crossSourceLinks?: Array<{
    url: string;
    mentionedIn: string[];
  }>;
}

export interface MediaComparisonResponse {
  coverageAnalysis: {
    uniqueToArticles: string[];
    uniqueToVideos: string[]; // Based on title analysis
    uniqueToPodcasts: string[];
    commonThemes: string[];
  };
  perspectiveDifferences: Array<{
    topic: string;
    articlePerspective: string;
    videoPerspective: string; // Inferred from titles
    podcastPerspective?: string;
  }>;
  emphasisAnalysis: {
    articleEmphasis: string[];
    videoEmphasis: string[]; // Based on title keywords/themes
    podcastEmphasis?: string[];
  };
  linkAnalysis: {
    sharedLinks: string[]; // Links mentioned across multiple media types
    mediaSpecificLinks: {
      articles: string[];
      videos: string[]; // Usually empty (videos don't have links)
      podcasts: string[];
    };
  };
}

class OllamaService {
  private client: Ollama | null = null;
  private model: string = 'gpt-oss:120b';
  private timeout: number = 30000; // 30 seconds

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Ollama client with Cloud API credentials
   */
  private initialize() {
    const apiKey = process.env.OLLAMA_API_KEY;

    if (!apiKey) {
      console.warn('⚠️  OLLAMA_API_KEY not configured - AI analysis will be disabled');
      console.warn('   Get your API key from https://ollama.com and add to backend/.env');
      this.client = null;
      return;
    }

    try {
      this.client = new Ollama({
        host: 'https://ollama.com',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      // Override model if specified
      if (process.env.OLLAMA_MODEL) {
        this.model = process.env.OLLAMA_MODEL;
      }

      console.log('✅ Ollama Cloud API configured (API key present)');
      console.log(`   Model: ${this.model}`);
      console.log(`   Note: Actual connectivity will be verified on first API call`);
    } catch (error) {
      console.error('❌ Failed to initialize Ollama client:', error);
      this.client = null;
    }
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Get current model name
   */
  getModelName(): string {
    return this.model;
  }

  /**
   * Summarize text content into concise bullet points
   * Supports both plain text (backward compatibility) and PreparedContent (enhanced)
   */
  async summarize(textOrContent: string | PreparedContent, sourceMetadata?: { name: string; reliabilityRating: string }): Promise<SummarizeResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    // Handle PreparedContent (enhanced) or plain string (backward compatibility)
    // Check for PreparedContent by looking for unique properties (mediaType and metadata)
    const isPreparedContent = typeof textOrContent === 'object' && 
                               textOrContent !== null && 
                               'text' in textOrContent && 
                               'mediaType' in textOrContent && 
                               'metadata' in textOrContent;
    const content = isPreparedContent ? textOrContent as PreparedContent : null;
    const text = isPreparedContent ? (textOrContent as PreparedContent).text : textOrContent as string;

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot summarize empty text');
    }

    // Use enhanced prompt if PreparedContent is provided
    // Enhanced prompts include: source metadata, links, document structure, media type
    const prompt = content
      ? this.buildAnalysisPrompt(content, 'summary', sourceMetadata)
      : `Summarize the following article in 3-5 concise bullet points. Be factual and explicit about any uncertain claims. Do not add interpretation beyond what is stated.

Article:
${text.substring(0, 4000)} ${text.length > 4000 ? '...(truncated)' : ''}

Respond with a JSON object in this exact format:
{
  "summary": "A brief 1-2 sentence overview",
  "bulletPoints": ["First key point", "Second key point", "Third key point"]
}`;

    try {
      const response = await this.callWithTimeout(prompt);
      const parsed = this.parseJsonResponse(response);

      return {
        summary: parsed.summary || 'Summary generation failed',
        bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
      };
    } catch (error) {
      console.error('Summarization error:', error);
      throw new Error(`Summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract entities (people, organizations, locations) from text
   * Supports both plain text (backward compatibility) and PreparedContent (enhanced)
   */
  async extractEntities(textOrContent: string | PreparedContent, sourceMetadata?: { name: string; reliabilityRating: string }): Promise<EntityExtractionResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    // Handle PreparedContent (enhanced) or plain string (backward compatibility)
    // Check for PreparedContent by looking for unique properties (mediaType and metadata)
    const isPreparedContent = typeof textOrContent === 'object' && 
                               textOrContent !== null && 
                               'text' in textOrContent && 
                               'mediaType' in textOrContent && 
                               'metadata' in textOrContent;
    const content = isPreparedContent ? textOrContent as PreparedContent : null;
    const text = isPreparedContent ? (textOrContent as PreparedContent).text : textOrContent as string;

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot extract entities from empty text');
    }

    // Use enhanced prompt if PreparedContent is provided
    const prompt = content
      ? this.buildAnalysisPrompt(content, 'entities', sourceMetadata)
      : `Extract named entities from the following text. Identify people, organizations, locations, and dates.

Text:
${text.substring(0, 4000)} ${text.length > 4000 ? '...(truncated)' : ''}

Respond with a JSON object in this exact format:
{
  "people": ["Name 1", "Name 2"],
  "organizations": ["Org 1", "Org 2"],
  "locations": ["Location 1", "Location 2"],
  "dates": ["Date 1", "Date 2"]
}

Only include entities explicitly mentioned in the text. If uncertain, exclude them.`;

    try {
      const response = await this.callWithTimeout(prompt);
      const parsed = this.parseJsonResponse(response);

      return {
        people: Array.isArray(parsed.people) ? parsed.people : [],
        organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
        locations: Array.isArray(parsed.locations) ? parsed.locations : [],
        dates: Array.isArray(parsed.dates) ? parsed.dates : [],
      };
    } catch (error) {
      console.error('Entity extraction error:', error);
      throw new Error(`Entity extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze tone and potential bias in text
   * Supports both plain text (backward compatibility) and PreparedContent (enhanced)
   */
  async analyzeTone(textOrContent: string | PreparedContent, sourceMetadata?: { name: string; reliabilityRating: string }): Promise<ToneAnalysisResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    // Handle PreparedContent (enhanced) or plain string (backward compatibility)
    // Check for PreparedContent by looking for unique properties (mediaType and metadata)
    const isPreparedContent = typeof textOrContent === 'object' && 
                               textOrContent !== null && 
                               'text' in textOrContent && 
                               'mediaType' in textOrContent && 
                               'metadata' in textOrContent;
    const content = isPreparedContent ? textOrContent as PreparedContent : null;
    const text = isPreparedContent ? (textOrContent as PreparedContent).text : textOrContent as string;

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot analyze tone of empty text');
    }

    // Use enhanced prompt if PreparedContent is provided
    const prompt = content
      ? this.buildAnalysisPrompt(content, 'tone', sourceMetadata)
      : `Analyze the tone and potential bias in the following text. Identify whether it's neutral reporting, opinion, propaganda, or sensational.

Text:
${text.substring(0, 4000)} ${text.length > 4000 ? '...(truncated)' : ''}

Respond with a JSON object in this exact format:
{
  "overallTone": "neutral" | "opinion" | "propaganda" | "factual" | "sensational",
  "confidence": 0.85,
  "indicators": ["Uses loaded language", "Presents multiple perspectives"],
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "biasSignals": ["Specific examples of bias or neutrality"]
}

Be explicit about uncertainty. Base assessment only on the text provided.`;

    try {
      const response = await this.callWithTimeout(prompt);
      const parsed = this.parseJsonResponse(response);

      // Get raw confidence from model (0.0 to 1.0)
      const rawConfidence = typeof parsed.confidence === 'number' 
        ? Math.max(0, Math.min(1, parsed.confidence)) // Clamp to [0, 1]
        : 0.5;

      // Weight confidence by source reliability
      const reliabilityMultiplier = this.getReliabilityMultiplier(sourceMetadata?.reliabilityRating);
      const weightedConfidence = rawConfidence * reliabilityMultiplier;

      return {
        overallTone: parsed.overallTone || 'neutral',
        confidence: weightedConfidence, // Now weighted by source reliability
        rawConfidence, // Store original confidence for reference
        indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [],
        sentiment: parsed.sentiment || 'neutral',
        biasSignals: Array.isArray(parsed.biasSignals) ? parsed.biasSignals : [],
      };
    } catch (error) {
      console.error('Tone analysis error:', error);
      throw new Error(`Tone analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get reliability multiplier for confidence weighting
   * HIGH = 1.0x (full confidence), MEDIUM = 0.8x, LOW = 0.6x, UNKNOWN = 0.7x
   */
  private getReliabilityMultiplier(reliabilityRating?: string): number {
    switch (reliabilityRating?.toUpperCase()) {
      case 'HIGH':
        return 1.0;
      case 'MEDIUM':
        return 0.8;
      case 'LOW':
        return 0.6;
      case 'UNKNOWN':
      default:
        return 0.7;
    }
  }

  /**
   * Call Ollama API with timeout protection
   */
  private async callWithTimeout(prompt: string): Promise<string> {
    if (!this.client) {
      throw new Error('Ollama client not initialized');
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), this.timeout);
    });

    const callPromise = this.client.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });

    try {
      const response = await Promise.race([callPromise, timeoutPromise]);
      return response.message.content;
    } catch (error) {
      if (error instanceof Error && error.message === 'Request timeout') {
        throw new Error('Ollama API request timed out');
      }
      throw error;
    }
  }

  /**
   * Extract key facts from content
   */
  async extractKeyFacts(content: PreparedContent, sourceMetadata?: { name: string; reliabilityRating: string }): Promise<KeyFactsResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    if (!content.text || content.text.trim().length === 0) {
      throw new Error('Cannot extract key facts from empty content');
    }

    const prompt = this.buildAnalysisPrompt(content, 'key_facts', sourceMetadata);

    try {
      const response = await this.callWithTimeout(prompt);
      const parsed = this.parseJsonResponse(response);

      return {
        facts: Array.isArray(parsed.facts) ? parsed.facts.map((f: any) => ({
          fact: f.fact || '',
          confidence: typeof f.confidence === 'number' ? f.confidence : 0.5,
          category: f.category || undefined,
          supportingLinks: Array.isArray(f.supportingLinks) ? f.supportingLinks : undefined,
        })) : [],
      };
    } catch (error) {
      console.error('Key facts extraction error:', error);
      throw new Error(`Key facts extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Summarize a topic across multiple source records
   */
  async summarizeTopic(
    records: PreparedContent[],
    topicContext: { name: string; description?: string; decisionQuestion?: string },
    sourceMetadata?: { name: string; reliabilityRating: string }
  ): Promise<TopicSummaryResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    if (!records || records.length === 0) {
      throw new Error('Cannot summarize topic with no source records');
    }

    const prompt = this.buildTopicSummaryPrompt(records, topicContext, sourceMetadata);

    try {
      const response = await this.callWithTimeout(prompt);
      const parsed = this.parseJsonResponse(response);

      return {
        executiveSummary: parsed.executiveSummary || '',
        keyDevelopments: Array.isArray(parsed.keyDevelopments) ? parsed.keyDevelopments : [],
        conflictingPerspectives: Array.isArray(parsed.conflictingPerspectives) ? parsed.conflictingPerspectives : undefined,
        timelineHighlights: Array.isArray(parsed.timelineHighlights) ? parsed.timelineHighlights : undefined,
        recommendedNextSteps: Array.isArray(parsed.recommendedNextSteps) ? parsed.recommendedNextSteps : undefined,
        crossSourceLinks: Array.isArray(parsed.crossSourceLinks) ? parsed.crossSourceLinks : undefined,
      };
    } catch (error) {
      console.error('Topic summarization error:', error);
      throw new Error(`Topic summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build enhanced analysis prompt with metadata, links, and structure
   */
  private buildAnalysisPrompt(
    content: PreparedContent,
    analysisType: 'summary' | 'entities' | 'tone' | 'key_facts',
    sourceMetadata?: { name: string; reliabilityRating: string }
  ): string {
    const mediaTypeNote = content.mediaType === 'video' 
      ? '\nNote: This is a video. Only the title is available for analysis.'
      : '';

    const taskDescriptions = {
      summary: 'Summarize this content in 3-5 concise bullet points. Be factual and explicit about any uncertain claims.',
      entities: 'Extract named entities (people, organizations, locations, dates) from this content. Only include entities explicitly mentioned.',
      tone: 'Analyze the tone and potential bias. Identify whether it\'s neutral reporting, opinion, propaganda, or sensational.',
      key_facts: 'Extract key factual claims, events, quotes, and statistics from this content. Include confidence scores and note which links (if any) support each fact.',
    };

    const outputFormats = {
      summary: `{
  "summary": "A brief 1-2 sentence overview",
  "bulletPoints": ["First key point", "Second key point", "Third key point"]
}`,
      entities: `{
  "people": ["Name 1", "Name 2"],
  "organizations": ["Org 1", "Org 2"],
  "locations": ["Location 1", "Location 2"],
  "dates": ["Date 1", "Date 2"]
}`,
      tone: `{
  "overallTone": "neutral" | "opinion" | "propaganda" | "factual" | "sensational",
  "confidence": 0.85,
  "indicators": ["Uses loaded language", "Presents multiple perspectives"],
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "biasSignals": ["Specific examples of bias or neutrality"]
}`,
      key_facts: `{
  "facts": [
    {
      "fact": "A specific factual claim or event",
      "confidence": 0.85,
      "category": "event" | "quote" | "statistic" | "claim",
      "supportingLinks": ["url1", "url2"]
    }
  ]
}`,
    };

    return `You are analyzing ${content.mediaType === 'video' ? 'a video title' : 'a web page/article'} for intelligence purposes.

SOURCE CONTEXT:
- Site: ${content.metadata.siteName || 'Unknown'}
- Author: ${content.metadata.author || 'Unknown'}
- Published: ${content.metadata.publishedAt?.toISOString() || 'Unknown'}
- Original URL: ${content.metadata.url}
- Media Type: ${content.mediaType}
- Word Count: ${content.structure?.wordCount || 'N/A (video title only)'}
${sourceMetadata ? `- Source: ${sourceMetadata.name} (${sourceMetadata.reliabilityRating} reliability)` : ''}
${mediaTypeNote}

CONTENT:
${content.text.substring(0, 8000)}${content.text.length > 8000 ? '...(truncated)' : ''}

${content.links.length > 0 ? `
RELATED LINKS FOUND IN CONTENT:
${content.links.map(link => 
  `- "${link.text}" → ${link.url}${link.context ? ` (context: ${link.context})` : ''}`
).join('\n')}

Note: These links may provide additional context. Consider whether they support or contradict the main content.
` : ''}

${content.structure?.headings.length > 0 ? `
DOCUMENT STRUCTURE:
${content.structure.headings.join(' → ')}
` : ''}

ANALYSIS TASK: ${taskDescriptions[analysisType]}

INSTRUCTIONS:
- Base analysis only on provided content
${content.mediaType === 'video' ? '- This is a video title - analyze what the video is likely about based on the title' : ''}
- Links are provided for reference (do not fetch them)
- Be explicit about uncertainty
- Distinguish facts stated vs. your inferences
- If content references external sources via links, note this

Respond with a JSON object in this exact format:
${outputFormats[analysisType]}`;
  }

  /**
   * Compare content across different media types
   */
  async compareMediaTypes(
    records: Array<{ 
      mediaType: MediaType; 
      content: PreparedContent; 
      sourceName: string 
    }>
  ): Promise<MediaComparisonResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    if (!records || records.length === 0) {
      throw new Error('Cannot compare media types with no records');
    }

    // Group by media type
    const byMediaType = {
      articles: records.filter(r => r.mediaType === 'article'),
      videos: records.filter(r => r.mediaType === 'video'),
      podcasts: records.filter(r => r.mediaType === 'podcast'),
      audio: records.filter(r => r.mediaType === 'audio'),
      other: records.filter(r => r.mediaType === 'other'),
    };

    // Count unique media types
    const uniqueMediaTypes = Object.entries(byMediaType)
      .filter(([_, records]) => records.length > 0)
      .map(([type, _]) => type);

    if (uniqueMediaTypes.length < 2) {
      throw new Error('At least 2 different media types required for comparison');
    }

    const prompt = this.buildMediaComparisonPrompt(records, byMediaType);

    try {
      const response = await this.callWithTimeout(prompt);
      const parsed = this.parseJsonResponse(response);

      return {
        coverageAnalysis: {
          uniqueToArticles: Array.isArray(parsed.coverageAnalysis?.uniqueToArticles) 
            ? parsed.coverageAnalysis.uniqueToArticles 
            : [],
          uniqueToVideos: Array.isArray(parsed.coverageAnalysis?.uniqueToVideos)
            ? parsed.coverageAnalysis.uniqueToVideos
            : [],
          uniqueToPodcasts: Array.isArray(parsed.coverageAnalysis?.uniqueToPodcasts)
            ? parsed.coverageAnalysis.uniqueToPodcasts
            : [],
          commonThemes: Array.isArray(parsed.coverageAnalysis?.commonThemes)
            ? parsed.coverageAnalysis.commonThemes
            : [],
        },
        perspectiveDifferences: Array.isArray(parsed.perspectiveDifferences)
          ? parsed.perspectiveDifferences.map((pd: any) => ({
              topic: pd.topic || '',
              articlePerspective: pd.articlePerspective || '',
              videoPerspective: pd.videoPerspective || '',
              podcastPerspective: pd.podcastPerspective || undefined,
            }))
          : [],
        emphasisAnalysis: {
          articleEmphasis: Array.isArray(parsed.emphasisAnalysis?.articleEmphasis)
            ? parsed.emphasisAnalysis.articleEmphasis
            : [],
          videoEmphasis: Array.isArray(parsed.emphasisAnalysis?.videoEmphasis)
            ? parsed.emphasisAnalysis.videoEmphasis
            : [],
          podcastEmphasis: Array.isArray(parsed.emphasisAnalysis?.podcastEmphasis)
            ? parsed.emphasisAnalysis.podcastEmphasis
            : undefined,
        },
        linkAnalysis: {
          sharedLinks: Array.isArray(parsed.linkAnalysis?.sharedLinks)
            ? parsed.linkAnalysis.sharedLinks
            : [],
          mediaSpecificLinks: {
            articles: Array.isArray(parsed.linkAnalysis?.mediaSpecificLinks?.articles)
              ? parsed.linkAnalysis.mediaSpecificLinks.articles
              : [],
            videos: Array.isArray(parsed.linkAnalysis?.mediaSpecificLinks?.videos)
              ? parsed.linkAnalysis.mediaSpecificLinks.videos
              : [],
            podcasts: Array.isArray(parsed.linkAnalysis?.mediaSpecificLinks?.podcasts)
              ? parsed.linkAnalysis.mediaSpecificLinks.podcasts
              : [],
          },
        },
      };
    } catch (error) {
      console.error('Media comparison error:', error);
      throw new Error(`Media comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build media comparison prompt
   */
  private buildMediaComparisonPrompt(
    records: Array<{ mediaType: MediaType; content: PreparedContent; sourceName: string }>,
    byMediaType: {
      articles: typeof records;
      videos: typeof records;
      podcasts: typeof records;
      audio: typeof records;
      other: typeof records;
    }
  ): string {
    const articlesText = byMediaType.articles.map((r, idx) => `
--- ARTICLE ${idx + 1} ---
Source: ${r.sourceName}
Title: ${r.content.metadata.siteName || 'Unknown'} - ${r.content.text.substring(0, 200)}${r.content.text.length > 200 ? '...' : ''}
Published: ${r.content.metadata.publishedAt?.toISOString() || 'Unknown'}
URL: ${r.content.metadata.url}
${r.content.links.length > 0 ? `Links: ${r.content.links.map(l => l.url).join(', ')}` : ''}
${r.content.text.length > 2000 ? r.content.text.substring(0, 2000) + '...(truncated)' : r.content.text}
`).join('\n');

    const videosText = byMediaType.videos.map((r, idx) => `
--- VIDEO ${idx + 1} (TITLE ONLY) ---
Source: ${r.sourceName}
Title: ${r.content.text}
Published: ${r.content.metadata.publishedAt?.toISOString() || 'Unknown'}
URL: ${r.content.metadata.url}
Note: Only the video title is available for analysis. Infer content from title.
`).join('\n');

    const podcastsText = byMediaType.podcasts.map((r, idx) => `
--- PODCAST ${idx + 1} ---
Source: ${r.sourceName}
Title: ${r.content.text.substring(0, 200)}${r.content.text.length > 200 ? '...' : ''}
Published: ${r.content.metadata.publishedAt?.toISOString() || 'Unknown'}
URL: ${r.content.metadata.url}
${r.content.text.length > 2000 ? r.content.text.substring(0, 2000) + '...(truncated)' : r.content.text}
`).join('\n');

    // Collect all links from articles
    const allLinks = byMediaType.articles.flatMap(r => r.content.links);
    const uniqueLinks = Array.from(new Set(allLinks.map(l => l.url)));

    return `You are analyzing content across different media types to identify differences in coverage, perspective, and emphasis.

MEDIA TYPE BREAKDOWN:
- Articles: ${byMediaType.articles.length}
- Videos: ${byMediaType.videos.length} (title-only analysis)
- Podcasts: ${byMediaType.podcasts.length}

ARTICLES:
${articlesText || '(No articles)'}

VIDEOS (TITLE ONLY):
${videosText || '(No videos)'}

PODCASTS:
${podcastsText || '(No podcasts)'}

${uniqueLinks.length > 0 ? `
LINKS MENTIONED IN ARTICLES:
${uniqueLinks.map(url => {
  const mentionedIn = byMediaType.articles
    .filter((r, idx) => r.content.links.some(l => l.url === url))
    .map((r, idx) => `Article ${byMediaType.articles.indexOf(r) + 1}`);
  return `- ${url} (mentioned in: ${mentionedIn.join(', ')})`;
}).join('\n')}
` : ''}

ANALYSIS TASK:
Compare and contrast how different media types cover this topic. Identify:

1. **Coverage Analysis:**
   - What themes or information are unique to articles?
   - What themes or information are unique to videos? (infer from titles)
   - What themes or information are unique to podcasts?
   - What themes are common across all media types?

2. **Perspective Differences:**
   - How do articles frame the topic?
   - How do videos frame the topic? (infer from titles)
   - How do podcasts frame the topic?
   - Identify specific topics where perspectives differ

3. **Emphasis Analysis:**
   - What do articles emphasize?
   - What do videos emphasize? (based on title keywords/themes)
   - What do podcasts emphasize?

4. **Link Analysis:**
   - Which links are shared across multiple media types?
   - Which links are specific to articles?
   - Note: Videos typically don't have links (title-only)

IMPORTANT NOTES:
- Videos only have titles available - infer content and perspective from title analysis
- Be explicit about limitations when video content is involved
- Links are provided for reference (do not fetch them)
- Distinguish between what is stated vs. what you infer

Respond with a JSON object in this exact format:
{
  "coverageAnalysis": {
    "uniqueToArticles": ["Theme 1", "Theme 2"],
    "uniqueToVideos": ["Theme 1 (inferred from titles)", "Theme 2"],
    "uniqueToPodcasts": ["Theme 1"],
    "commonThemes": ["Theme shared across all"]
  },
  "perspectiveDifferences": [
    {
      "topic": "Specific topic or aspect",
      "articlePerspective": "How articles frame it",
      "videoPerspective": "How videos frame it (inferred from titles)",
      "podcastPerspective": "How podcasts frame it"
    }
  ],
  "emphasisAnalysis": {
    "articleEmphasis": ["What articles emphasize"],
    "videoEmphasis": ["What videos emphasize (from title analysis)"],
    "podcastEmphasis": ["What podcasts emphasize"]
  },
  "linkAnalysis": {
    "sharedLinks": ["URLs mentioned across multiple media types"],
    "mediaSpecificLinks": {
      "articles": ["URLs only in articles"],
      "videos": [],
      "podcasts": ["URLs only in podcasts"]
    }
  }
}`;
  }

  /**
   * Build topic summary prompt for multiple source records
   */
  private buildTopicSummaryPrompt(
    records: PreparedContent[],
    topicContext: { name: string; description?: string; decisionQuestion?: string },
    sourceMetadata?: { name: string; reliabilityRating: string }
  ): string {
    const recordsText = records.map((record, index) => {
      const mediaNote = record.mediaType === 'video' ? ' (VIDEO - title only)' : '';
      return `
--- SOURCE ${index + 1}${mediaNote} ---
Title: ${record.metadata.siteName || 'Unknown'} - ${record.text.substring(0, 200)}${record.text.length > 200 ? '...' : ''}
Published: ${record.metadata.publishedAt?.toISOString() || 'Unknown'}
URL: ${record.metadata.url}
${record.links.length > 0 ? `Links: ${record.links.map(l => l.url).join(', ')}` : ''}
${record.text.length > 2000 ? record.text.substring(0, 2000) + '...(truncated)' : record.text}
`;
    }).join('\n');

    const allLinks = records.flatMap(r => r.links);
    const uniqueLinks = Array.from(new Set(allLinks.map(l => l.url)));

    return `You are synthesizing intelligence across multiple sources for the topic: "${topicContext.name}"

${topicContext.description ? `Topic Description: ${topicContext.description}` : ''}
${topicContext.decisionQuestion ? `Intelligence Question: ${topicContext.decisionQuestion}` : ''}

${sourceMetadata ? `Source Context: ${sourceMetadata.name} (${sourceMetadata.reliabilityRating} reliability)` : ''}

SOURCES TO ANALYZE (${records.length} total):
${recordsText}

${uniqueLinks.length > 0 ? `
LINKS MENTIONED ACROSS SOURCES:
${uniqueLinks.map(url => {
  const mentionedIn = records
    .filter((r, idx) => r.links.some(l => l.url === url))
    .map((r, idx) => `Source ${records.indexOf(r) + 1}`);
  return `- ${url} (mentioned in: ${mentionedIn.join(', ')})`;
}).join('\n')}
` : ''}

ANALYSIS TASK:
Synthesize these sources into a comprehensive intelligence summary. Identify:
- Key developments and events
- Conflicting perspectives or contradictory information
- Timeline of important events
- Links mentioned across multiple sources (potential coordination or shared narratives)
- Recommended next steps for further investigation

Note: Some sources may be videos (title-only analysis). Be explicit about limitations when video content is involved.

Respond with a JSON object in this exact format:
{
  "executiveSummary": "A comprehensive 2-3 paragraph summary synthesizing all sources",
  "keyDevelopments": ["Development 1", "Development 2", "Development 3"],
  "conflictingPerspectives": ["Perspective A vs Perspective B", "..."],
  "timelineHighlights": ["Event 1 on Date", "Event 2 on Date"],
  "recommendedNextSteps": ["Action 1", "Action 2"],
  "crossSourceLinks": [
    {
      "url": "https://example.com",
      "mentionedIn": ["Source 1", "Source 3"]
    }
  ]
}`;
  }

  /**
   * Parse JSON response from Ollama, handling markdown code blocks
   */
  private parseJsonResponse(response: string): any {
    try {
      // Try direct parse first
      return JSON.parse(response);
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try to find JSON object in response
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }

      throw new Error('Could not parse JSON from response');
    }
  }
}

// Export singleton instance
export const ollamaService = new OllamaService();

