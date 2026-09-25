import type { Ollama } from 'ollama';
import type { BriefClaimVerbiage } from '../types/briefClaim.js';
import { getOllamaClient, getOllamaModelName } from './ollamaFraming.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export type ClaimHeadlineInput = {
  title: string;
  stance: 'supports' | 'contradicts' | 'mentions';
  sourceTier: 'primary' | 'sensor';
  publisherDomain: string | null;
  publishedAt: string | null;
};

export type ClaimVerbiageInput = {
  claimText: string;
  claimType: string;
  status: string;
  linkedHeadlines: ClaimHeadlineInput[];
};

export type GenerateClaimVerbiageDeps = {
  ollama?: Pick<Ollama, 'chat'> | null;
  model?: string;
  timeoutMs?: number;
};

export type ClaimVerbiageSuccess = {
  ok: true;
  enrichment: BriefClaimVerbiage;
  model: string;
  rawText: string;
};

export type ClaimVerbiageFailure = {
  ok: false;
  error: string;
  model: string | null;
  rawText: string | null;
};

export type ClaimVerbiageResult = ClaimVerbiageSuccess | ClaimVerbiageFailure;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
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

export function buildClaimVerbiagePrompt(input: ClaimVerbiageInput): string {
  const claimText = input.claimText.trim() || '(no claim text)';
  const claimType = input.claimType.trim() || 'unknown';
  const status = input.status.trim() || 'unknown';

  const headlines =
    input.linkedHeadlines.length > 0
      ? input.linkedHeadlines
          .map((headline, index) =>
            [
              `Headline ${index + 1}:`,
              `Title: ${headline.title.trim() || '(no title)'}`,
              `Stance: ${headline.stance}`,
              `Source tier: ${headline.sourceTier}`,
              `Publisher domain: ${headline.publisherDomain?.trim() || 'unknown'}`,
              `PublishedAt: ${headline.publishedAt?.trim() || 'unknown'}`,
            ].join('\n'),
          )
          .join('\n\n')
      : 'No linked headlines available.';

  return `You are an OSINT claims desk assistant. Write brief AI-assisted verbiage for an accepted claim using ONLY the claim text, status, and linked headlines below.
Do not change the claim status, do not provide a verdict, and do not invent facts from outside the provided text.
This copy is AI-assisted and not ground truth, so be explicit about uncertainty when evidence is mixed or thin.

Claim:
- Text: ${claimText}
- Type: ${claimType}
- Status: ${status}

Linked headlines:
${headlines}

Respond with JSON only (no markdown fences) in this exact shape:
{
  "short_summary": "1-2 sentences",
  "talking_points": ["string"]
}

Rules:
- short_summary must restate the claim carefully and note evidence limits or disagreement when relevant.
- talking_points should be concise, concrete, and grounded in the linked headlines.
- Do not include fields other than short_summary and talking_points.
- No markdown, no backticks, no commentary outside JSON.`;
}

export function parseClaimVerbiageResponse(raw: string): BriefClaimVerbiage {
  const parsed = parseJsonResponse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Claim verbiage payload must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  const short_summary =
    typeof record.short_summary === 'string' ? record.short_summary.trim() : '';
  if (!short_summary) {
    throw new Error('Claim verbiage short_summary is required');
  }

  return {
    short_summary,
    talking_points: asStringArray(record.talking_points),
  };
}

async function chatWithTimeout(
  ollama: Pick<Ollama, 'chat'>,
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Ollama API request timed out')),
      timeoutMs,
    );
  });

  try {
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
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function generateClaimVerbiage(
  input: ClaimVerbiageInput,
  deps: GenerateClaimVerbiageDeps = {},
): Promise<ClaimVerbiageResult> {
  const ollama = deps.ollama === undefined ? getOllamaClient() : deps.ollama;
  const model = deps.model ?? getOllamaModelName();
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!ollama) {
    return {
      ok: false,
      error: 'Ollama service not available — OLLAMA_API_KEY not configured',
      model: null,
      rawText: null,
    };
  }

  if (!input.claimText.trim()) {
    return {
      ok: false,
      error: 'Cannot enrich a claim without claim text',
      model,
      rawText: null,
    };
  }

  let rawText: string | null = null;
  try {
    const prompt = buildClaimVerbiagePrompt(input);
    rawText = await chatWithTimeout(ollama, model, prompt, timeoutMs);
    const enrichment = parseClaimVerbiageResponse(rawText);
    return {
      ok: true,
      enrichment,
      model,
      rawText,
    };
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
