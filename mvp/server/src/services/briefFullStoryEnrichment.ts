import type { BriefFullStoryEnrichment } from '../types/briefFullStory.js';
import type {
  EnrichmentQnA,
  EnrichmentTimelineEvent,
} from '../types/clusterEnrichment.js';
import { FULL_STORY_BODY_MAX_CHARS } from './briefConfig.js';
import { getOllamaClient, getOllamaModelName } from './ollamaFraming.js';
import type { Ollama } from 'ollama';

export type { BriefFullStoryEnrichment } from '../types/briefFullStory.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export type FullStoryMemberInput = {
  title: string;
  publisherDomain: string;
  publishedAt: string;
  bodyOrSnippet: string;
  framingSummary?: string;
};

export type FullStoryRequestedSection = 'business' | 'technical' | 'action' | 'history';

export type FullStoryEnrichRequest = {
  members: FullStoryMemberInput[];
  requestedSections: FullStoryRequestedSection[];
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

const SECTION_PROMPT_HINTS: Record<FullStoryRequestedSection, string> = {
  business:
    'business_angle_text (optional short paragraph) and business_angle_points (optional bullet strings)',
  technical: 'technical_details (optional array of strings)',
  action: 'user_action_items (optional array of practical follow-up strings)',
  history: 'historical_background (optional short paragraph)',
};

function buildOptionalJsonShape(requested: FullStoryRequestedSection[]): string {
  const lines: string[] = [];
  if (requested.includes('business')) {
    lines.push('  "business_angle_text": "optional string",');
    lines.push('  "business_angle_points": ["optional string"],');
  }
  if (requested.includes('technical')) {
    lines.push('  "technical_details": ["optional string"],');
  }
  if (requested.includes('action')) {
    lines.push('  "user_action_items": ["optional string"],');
  }
  if (requested.includes('history')) {
    lines.push('  "historical_background": "optional string",');
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function buildRequestedSectionRules(requested: FullStoryRequestedSection[]): string {
  if (requested.length === 0) {
    return '- No optional topic sections were requested; omit business, technical, action, history, and map fields entirely.';
  }
  const names = requested.join(', ');
  const hints = requested.map((s) => `- ${s}: ${SECTION_PROMPT_HINTS[s]}`).join('\n');
  return [
    `Optional topic sections requested: ${names}.`,
    'Only include optional fields for requested sections, and only when the member texts support them.',
    'Never include map or geographic coordinates.',
    hints,
  ].join('\n');
}

export function buildFullStoryEnrichmentPrompt(req: FullStoryEnrichRequest): string {
  const items = req.members
    .map((m, idx) => {
      const title = m.title.trim() || '(no title)';
      const domain = m.publisherDomain.trim() || 'unknown';
      const publishedAt = m.publishedAt.trim() || 'unknown';
      const body = truncate(m.bodyOrSnippet || '', FULL_STORY_BODY_MAX_CHARS) || '(no text)';
      const framingSummary =
        typeof m.framingSummary === 'string' && m.framingSummary.trim()
          ? m.framingSummary.trim()
          : null;

      return [
        `Member ${idx + 1}:`,
        `Title: ${title}`,
        `PublishedAt: ${publishedAt}`,
        `Publisher domain: ${domain}`,
        `Body excerpt: ${body}`,
        ...(framingSummary ? [`Framing summary: ${framingSummary}`] : []),
      ].join('\n');
    })
    .join('\n\n');

  const optionalShape = buildOptionalJsonShape(req.requestedSections);
  const sectionRules = buildRequestedSectionRules(req.requestedSections);

  return `You are an OSINT media analyst. Synthesize full-story enrichment using ONLY the member texts below.
Do not invent facts from outside this text. Do not fetch or assume content beyond what is provided.
This is AI-assisted enrichment — not ground truth; be explicit about uncertainty.
Do not issue verdicts, guilt judgments, or "confirmed true/false" claims.

Story members:
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
${optionalShape}}

Rules:
- talking_points should be concrete, non-redundant, and grounded in the provided members.
- timeline events must be short and tied to what is stated or implied by the members; do not invent new events.
- suggested_qna should frame what a reader should verify or what remains unknown — not definitive verdicts.
- Omit any optional section field you cannot support from the provided text; do not fabricate to fill sections.
${sectionRules}
- No markdown, no backticks, no commentary outside JSON.`;
}

function validateFullStoryPayload(
  parsed: unknown,
  requested: FullStoryRequestedSection[],
): BriefFullStoryEnrichment {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('BriefFullStoryEnrichment must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;

  const talking_points = asStringArray(obj.talking_points);
  const timeline = validateTimeline(obj.timeline);
  const suggested_qna = validateQnA(obj.suggested_qna);

  if (
    talking_points.length === 0 &&
    timeline.length === 0 &&
    suggested_qna.length === 0
  ) {
    throw new Error('Full-story enrichment payload was empty after validation');
  }

  const out: BriefFullStoryEnrichment = {
    talking_points,
    timeline,
    suggested_qna,
  };

  if (requested.includes('business')) {
    const business_angle_text =
      typeof obj.business_angle_text === 'string' && obj.business_angle_text.trim()
        ? obj.business_angle_text.trim()
        : undefined;
    const business_angle_points = asStringArray(obj.business_angle_points);
    if (business_angle_text) out.business_angle_text = business_angle_text;
    if (business_angle_points.length > 0) {
      out.business_angle_points = business_angle_points;
    }
  }

  if (requested.includes('technical')) {
    const technical_details = asStringArray(obj.technical_details);
    if (technical_details.length > 0) out.technical_details = technical_details;
  }

  if (requested.includes('action')) {
    const user_action_items = asStringArray(obj.user_action_items);
    if (user_action_items.length > 0) out.user_action_items = user_action_items;
  }

  if (requested.includes('history')) {
    const historical_background =
      typeof obj.historical_background === 'string' && obj.historical_background.trim()
        ? obj.historical_background.trim()
        : undefined;
    if (historical_background) out.historical_background = historical_background;
  }

  return out;
}

export function parseFullStoryEnrichmentResponse(
  raw: string,
  requested: FullStoryEnrichRequest['requestedSections'],
): BriefFullStoryEnrichment {
  const parsed = parseJsonResponse(raw);
  return validateFullStoryPayload(parsed, requested);
}

async function chatWithTimeout(
  ollama: Ollama,
  model: string,
  prompt: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
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

export type EnrichFullStoryDeps = {
  chat?: (prompt: string) => Promise<string>;
  model?: string;
  timeoutMs?: number;
};

export async function enrichFullStory(
  req: FullStoryEnrichRequest,
  deps?: EnrichFullStoryDeps,
): Promise<BriefFullStoryEnrichment> {
  if (!Array.isArray(req.members) || req.members.length === 0) {
    throw new Error('Cannot enrich a full story without any members');
  }

  const prompt = buildFullStoryEnrichmentPrompt(req);

  const chat =
    deps?.chat ??
    (async (p: string) => {
      const ollama = getOllamaClient();
      const model = deps?.model ?? getOllamaModelName();
      if (!ollama) {
        throw new Error('Ollama service not available — OLLAMA_API_KEY not configured');
      }
      return chatWithTimeout(ollama, model, p, deps?.timeoutMs);
    });

  const raw = await chat(prompt);
  return parseFullStoryEnrichmentResponse(raw, req.requestedSections);
}
