import type { Ollama } from 'ollama';
import type { ClaimType } from '../types/claim.js';
import { getOllamaClient, getOllamaModelName } from './ollamaFraming.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CANDIDATES = 5;

const CLAIM_TYPES: readonly ClaimType[] = [
  'event_occurrence',
  'attribution',
  'casualty_or_count',
  'official_statement',
  'territorial_or_control',
];

export type ClaimCandidate = {
  text: string;
  claimTypeGuess: ClaimType | null;
  quote: string | null;
};

export type ProposeClaimsSuccess = {
  ok: true;
  candidates: ClaimCandidate[];
  model: string;
  rawText: string;
};

export type ProposeClaimsFailure = {
  ok: false;
  error: string;
  model: string | null;
  rawText: string | null;
};

export type ProposeClaimsResult = ProposeClaimsSuccess | ProposeClaimsFailure;

export type ProposeClaimsInput = {
  title: string;
  snippet: string;
  bodyText?: string | null;
  publisherDomain?: string | null;
};

export type ProposeClaimsOptions = {
  client?: Ollama | null;
  model?: string;
};

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

function normalizeClaimType(value: unknown): ClaimType | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return (CLAIM_TYPES as readonly string[]).includes(trimmed)
    ? (trimmed as ClaimType)
    : null;
}

function normalizeQuote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function validateClaimCandidates(parsed: unknown): ClaimCandidate[] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Propose claims response must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  const rawCandidates = obj.candidates;
  if (!Array.isArray(rawCandidates)) {
    throw new Error('Propose claims response must include a candidates array');
  }

  const out: ClaimCandidate[] = [];
  for (const item of rawCandidates) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const text =
      typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) continue;

    out.push({
      text,
      claimTypeGuess: normalizeClaimType(row.claimTypeGuess),
      quote: normalizeQuote(row.quote),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }

  return out;
}

function buildProposePrompt(input: ProposeClaimsInput): string {
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
    ? 'Extract assertable claim spans from the headline and original text only.'
    : 'Extract assertable claim spans from the headline and snippet only.';

  const quoteLine = hasBody
    ? '- quote must be a short substring from the title or original text when possible; otherwise null.'
    : '- quote must be a short substring from the title or snippet when possible; otherwise null.';

  const claimTypeList = CLAIM_TYPES.map((t) => `"${t}"`).join(' | ');

  return `You are an OSINT analyst working in the conflict and geopolitics domain. ${scopeLine}
Do not invent facts from outside this text. Do not fetch or assume content beyond what is provided.
Do not judge whether claims are true or false. Do not output Accept/reject decisions.

${sourceBlock}

Respond with JSON only (no markdown fences) in this exact shape:
{
  "candidates": [
    {
      "text": "assertable claim span in plain language",
      "claimTypeGuess": ${claimTypeList} | null,
      "quote": "short supporting substring or null"
    }
  ]
}

Rules:
- Return at most ${MAX_CANDIDATES} candidates.
- text must be a concise assertable claim span, not a headline summary or opinion label.
- claimTypeGuess is a best-effort label only; use null when unsure.
${quoteLine}
- This is AI-assisted claim extraction — not ground truth; extract spans only.`;
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
 * Propose assertable claim candidates from article text via Ollama.
 * Never silently returns fake success on parse/API failure.
 */
export async function proposeClaimCandidates(
  input: ProposeClaimsInput,
  opts?: ProposeClaimsOptions,
): Promise<ProposeClaimsResult> {
  const ollama = opts?.client !== undefined ? opts.client : getOllamaClient();
  const model = opts?.model?.trim() || getOllamaModelName();

  if (!ollama) {
    return {
      ok: false,
      error: 'Ollama service not available — OLLAMA_API_KEY not configured',
      model: null,
      rawText: null,
    };
  }

  let rawText: string | null = null;

  try {
    const prompt = buildProposePrompt(input);
    rawText = await chatWithTimeout(ollama, model, prompt);
    const parsed = parseJsonResponse(rawText);
    const candidates = validateClaimCandidates(parsed);
    return { ok: true, candidates, model, rawText };
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
