import type {
  ClusterEnrichmentPayload,
  EnrichmentQnA,
  EnrichmentTimelineEvent,
} from '../types/clusterEnrichment.js';
import { getOllamaClient, getOllamaModelName } from './ollamaFraming.js';
import type { Ollama } from 'ollama';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_SNIPPET_CHARS = 800;

export type EnrichMemberInput = {
  title: string;
  snippet: string;
  publisherDomain: string;
  publishedAt: string;
  framingSummary?: string;
};

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
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

function validateTimeline(value: unknown): EnrichmentTimelineEvent[] {
  if (!Array.isArray(value)) return [];
  const out: EnrichmentTimelineEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const date = typeof obj.date === 'string' ? obj.date.trim() : '';
    const content = typeof obj.content === 'string' ? obj.content.trim() : '';
    if (!date || !content) continue;
    const date_iso =
      typeof obj.date_iso === 'string' && obj.date_iso.trim()
        ? obj.date_iso.trim()
        : undefined;
    out.push({ date, content, ...(date_iso ? { date_iso } : {}) });
  }
  return out;
}

function validateQnA(value: unknown): EnrichmentQnA[] {
  if (!Array.isArray(value)) return [];
  const out: EnrichmentQnA[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const question = typeof obj.question === 'string' ? obj.question.trim() : '';
    const answer = typeof obj.answer === 'string' ? obj.answer.trim() : '';
    if (!question || !answer) continue;
    out.push({ question, answer });
  }
  return out;
}

function validateClusterEnrichmentPayload(parsed: unknown): ClusterEnrichmentPayload {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ClusterEnrichmentPayload must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;

  const talking_points = asStringArray(obj.talking_points);
  const timeline = validateTimeline(obj.timeline);
  const suggested_qna = validateQnA(obj.suggested_qna);
  const short_summary =
    typeof obj.short_summary === 'string' && obj.short_summary.trim()
      ? obj.short_summary.trim()
      : undefined;

  return {
    talking_points,
    timeline,
    suggested_qna,
    ...(short_summary ? { short_summary } : {}),
  };
}

export function buildEnrichmentPrompt(members: EnrichMemberInput[]): string {
  const items = members
    .map((m, idx) => {
      const title = m.title.trim() || '(no title)';
      const domain = m.publisherDomain.trim() || 'unknown';
      const publishedAt = m.publishedAt.trim() || 'unknown';
      const snippet = truncate(m.snippet || '', MAX_SNIPPET_CHARS) || '(no snippet)';
      const framingSummary =
        typeof m.framingSummary === 'string' && m.framingSummary.trim()
          ? m.framingSummary.trim()
          : null;

      return [
        `Member ${idx + 1}:`,
        `Title: ${title}`,
        `PublishedAt: ${publishedAt}`,
        `Publisher domain: ${domain}`,
        `Snippet: ${snippet}`,
        ...(framingSummary ? [`Framing summary: ${framingSummary}`] : []),
      ].join('\n');
    })
    .join('\n\n');

  return `You are an OSINT media analyst. Synthesize cluster-level enrichment using ONLY the member texts below.
Do not invent facts from outside this text. Do not fetch or assume content beyond what is provided.
This is AI-assisted enrichment — not ground truth; be explicit about uncertainty.

Cluster members:
${items}

Respond with JSON only (no markdown fences) in this exact shape:
{
  "talking_points": ["string"],
  "timeline": [
    { "date": "string", "content": "string", "date_iso": "optional ISO string" }
  ],
  "suggested_qna": [
    { "question": "string", "answer": "string" }
  ],
  "short_summary": "optional 1-2 sentences"
}

Rules:
- talking_points should be concrete, non-redundant, and grounded in the provided members.
- timeline events must be short and tied to what is stated or implied by the members; do not invent new events.
- suggested_qna should help a reader verify claims or understand missing context.
- No markdown, no backticks, no commentary outside JSON.`;
}

export function parseEnrichmentResponse(raw: string): ClusterEnrichmentPayload {
  const parsed = parseJsonResponse(raw);
  return validateClusterEnrichmentPayload(parsed);
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

export type EnrichClusterSuccess = {
  ok: true;
  enrichment: ClusterEnrichmentPayload;
  model: string;
  rawText: string;
};

export type EnrichClusterFailure = {
  ok: false;
  error: string;
  model: string | null;
  rawText: string | null;
};

export type EnrichClusterResult = EnrichClusterSuccess | EnrichClusterFailure;

export async function enrichCluster(
  members: EnrichMemberInput[],
): Promise<EnrichClusterResult> {
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

  if (!Array.isArray(members) || members.length === 0) {
    return {
      ok: false,
      error: 'Cannot enrich a cluster without any members',
      model,
      rawText: null,
    };
  }

  let rawText: string | null = null;
  try {
    const prompt = buildEnrichmentPrompt(members);
    rawText = await chatWithTimeout(ollama, model, prompt);
    const enrichment = parseEnrichmentResponse(rawText);
    return { ok: true, enrichment, model, rawText };
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

