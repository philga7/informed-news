import { Ollama } from 'ollama';
import type {
  Article,
  FramingAnalysis,
  FramingDimensions,
  FramingGenre,
} from '../types/article.js';

const OLLAMA_HOST = 'https://ollama.com';
const DEFAULT_MODEL = 'glm-5.2';
const DEFAULT_TIMEOUT_MS = 30_000;

const GENRES: readonly FramingGenre[] = [
  'news_blurb',
  'opinion',
  'analysis',
  'unclear',
];

const DIMENSION_KEYS: readonly (keyof FramingDimensions)[] = [
  'loadedLanguage',
  'emotionalAppeal',
  'certaintyClaiming',
  'omissionOrSelectionRisk',
  'attributionClarity',
];

/** Delimiter so callers can split error message vs raw model text */
export const CLASSIFY_RAW_DELIMITER = '\n\n--- raw ---\n';

export type FramingInput = {
  title: string;
  snippet: string;
  publisherDomain?: string | null;
  /** Publisher body or tweet text when available for deeper framing. */
  bodyText?: string | null;
};

export type FramingClassifySuccess = {
  ok: true;
  analysis: FramingAnalysis;
  model: string;
  rawText: string;
};

export type FramingClassifyFailure = {
  ok: false;
  error: string;
  model: string | null;
  rawText: string | null;
};

export type FramingClassifyResult =
  | FramingClassifySuccess
  | FramingClassifyFailure;

let client: Ollama | null | undefined;
let modelName = DEFAULT_MODEL;
let loggedInit = false;

function resolveModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Lazy-init Ollama Cloud client. Returns null when API key is missing.
 */
export function getOllamaClient(): Ollama | null {
  if (client !== undefined) {
    return client;
  }

  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  modelName = resolveModel();

  if (!apiKey) {
    if (!loggedInit) {
      console.warn(
        '⚠️  OLLAMA_API_KEY not configured — framing analysis disabled',
      );
      loggedInit = true;
    }
    client = null;
    return client;
  }

  try {
    client = new Ollama({
      host: OLLAMA_HOST,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!loggedInit) {
      console.log('✅ Ollama Cloud API configured (API key present)');
      console.log(`   Host: ${OLLAMA_HOST}`);
      console.log(`   Model: ${modelName}`);
      loggedInit = true;
    }
  } catch (err) {
    console.error('❌ Failed to initialize Ollama client:', err);
    client = null;
  }

  return client;
}

export function isOllamaAvailable(): boolean {
  return getOllamaClient() !== null;
}

export function getOllamaModelName(): string {
  modelName = resolveModel();
  return modelName;
}

/** Reset cached client (tests / env reload). */
export function resetOllamaClient(): void {
  client = undefined;
  loggedInit = false;
}

function clamp01(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseJsonResponse(response: string): unknown {
  try {
    return JSON.parse(response);
  } catch {
    const fenced = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error('Could not parse JSON from model response');
  }
}

function validateFramingAnalysis(parsed: unknown): FramingAnalysis {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('FramingAnalysis must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  const genreRaw = obj.genre;
  const genre: FramingGenre =
    typeof genreRaw === 'string' &&
    (GENRES as readonly string[]).includes(genreRaw)
      ? (genreRaw as FramingGenre)
      : 'unclear';

  const dimsRaw =
    obj.dimensions && typeof obj.dimensions === 'object'
      ? (obj.dimensions as Record<string, unknown>)
      : {};

  const dimensions = {} as FramingDimensions;
  for (const key of DIMENSION_KEYS) {
    dimensions[key] = clamp01(dimsRaw[key], 0);
  }

  const framingSummary =
    typeof obj.framingSummary === 'string' && obj.framingSummary.trim()
      ? obj.framingSummary.trim()
      : 'No framing summary provided by model.';

  return {
    genre,
    headlineDevices: asStringArray(obj.headlineDevices),
    dimensions,
    framingSummary,
    evidenceQuotes: asStringArray(obj.evidenceQuotes),
    openQuestions: asStringArray(obj.openQuestions),
    confidence: clamp01(obj.confidence, 0),
  };
}

function buildFramingPrompt(input: FramingInput): string {
  const domain = input.publisherDomain?.trim() || 'unknown';
  const title = input.title.trim() || '(no title)';
  const snippet = input.snippet.trim() || '(no snippet)';
  const body = input.bodyText?.trim() || '';
  const hasBody = body.length > 0;

  const sourceBlock = hasBody
    ? `Title: ${title}
Original text (truncated):
${body}
Publisher domain: ${domain}`
    : `Title: ${title}
Snippet: ${snippet}
Publisher domain: ${domain}`;

  const scopeLine = hasBody
    ? 'Analyze framing in the headline and original text only.'
    : 'Analyze framing in the headline and snippet only.';

  const evidenceLine = hasBody
    ? '- evidenceQuotes must be short substrings drawn from the title or original text when possible.'
    : '- evidenceQuotes must be short substrings drawn from the title/snippet when possible.';

  return `You are an OSINT media analyst. ${scopeLine}
Do not invent facts from outside this text. Do not fetch or assume content beyond what is provided.

${sourceBlock}

Respond with JSON only (no markdown fences) in this exact shape:
{
  "genre": "news_blurb" | "opinion" | "analysis" | "unclear",
  "headlineDevices": ["string"],
  "dimensions": {
    "loadedLanguage": 0.0,
    "emotionalAppeal": 0.0,
    "certaintyClaiming": 0.0,
    "omissionOrSelectionRisk": 0.0,
    "attributionClarity": 0.0
  },
  "framingSummary": "2-3 sentences",
  "evidenceQuotes": ["short quotes from the provided text"],
  "openQuestions": ["what a reader should verify"],
  "confidence": 0.0
}

Rules:
- All dimension scores and confidence must be numbers from 0 to 1 inclusive.
${evidenceLine}
- openQuestions should help a reader verify claims, not restate the headline.
- This is AI-assisted framing analysis — not ground truth; be explicit about uncertainty.`;
}

async function chatWithTimeout(
  ollama: Ollama,
  model: string,
  prompt: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Ollama API request timed out')), timeoutMs);
  });

  const callPromise = ollama.chat({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  });

  const response = await Promise.race([callPromise, timeoutPromise]);
  const content = response.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama returned empty message content');
  }
  return content;
}

/**
 * Classify framing from title + (body when present, else snippet) + optional publisher domain.
 * Never silently returns a fake success on parse/API failure.
 */
export async function classifyFraming(
  input: FramingInput,
): Promise<FramingClassifyResult> {
  const ollama = getOllamaClient();
  const model = getOllamaModelName();

  if (!ollama) {
    return {
      ok: false,
      error: 'Ollama service not available — OLLAMA_API_KEY not configured',
      model: null,
      rawText: null,
    };
  }

  const hasBody = Boolean(input.bodyText?.trim());
  if (!input.title?.trim() && !input.snippet?.trim() && !hasBody) {
    return {
      ok: false,
      error: 'Cannot classify framing without title, snippet, or body text',
      model,
      rawText: null,
    };
  }

  let rawText: string | null = null;

  try {
    const prompt = buildFramingPrompt(input);
    rawText = await chatWithTimeout(ollama, model, prompt);
    const parsed = parseJsonResponse(rawText);
    const analysis = validateFramingAnalysis(parsed);
    return { ok: true, analysis, model, rawText };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      model,
      rawText,
    };
  }
}

/**
 * Map a classify result onto Article classification fields.
 * On failure, persists recoverable error + raw model text (when available).
 */
export function articleFieldsFromClassifyResult(
  result: FramingClassifyResult,
  at = new Date().toISOString(),
): Pick<Article, 'classification' | 'classifiedAt' | 'classifyError'> {
  if (result.ok) {
    return {
      classification: result.analysis,
      classifiedAt: at,
      classifyError: null,
    };
  }

  const classifyError = result.rawText
    ? `${result.error}${CLASSIFY_RAW_DELIMITER}${result.rawText}`
    : result.error;

  return {
    classification: null,
    classifiedAt: null,
    classifyError,
  };
}
