import { Ollama } from 'ollama';

/**
 * OllamaService for Vercel Serverless Functions
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
  confidence: number;
  indicators: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  biasSignals: string[];
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
      console.warn('   Get your API key from https://ollama.com and add to Vercel env vars');
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
   */
  async summarize(text: string): Promise<SummarizeResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot summarize empty text');
    }

    const prompt = `Summarize the following article in 3-5 concise bullet points. Be factual and explicit about any uncertain claims. Do not add interpretation beyond what is stated.

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
   */
  async extractEntities(text: string): Promise<EntityExtractionResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot extract entities from empty text');
    }

    const prompt = `Extract named entities from the following text. Identify people, organizations, locations, and dates.

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
   */
  async analyzeTone(text: string): Promise<ToneAnalysisResponse> {
    if (!this.client) {
      throw new Error('Ollama service not available - API key not configured');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot analyze tone of empty text');
    }

    const prompt = `Analyze the tone and potential bias in the following text. Identify whether it's neutral reporting, opinion, propaganda, or sensational.

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

      return {
        overallTone: parsed.overallTone || 'neutral',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
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

