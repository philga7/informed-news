/**
 * One Brief story summary (NEWS-88): a 1–2 sentence neutral Ollama summary
 * written only from the story's source text. AI-assisted — not ground truth.
 */
import { SUMMARY_MAX_CHARS, SUMMARY_MIN_CHARS } from './briefConfig.js';
import { getOllamaClient, getOllamaModelName } from './ollamaFraming.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const SUMMARY_MAX_SENTENCES = 2;
export const OLLAMA_NOT_CONFIGURED = 'Ollama not configured';

export type SummarizeChat = {
  chat: (req: any) => Promise<{ message: { content: string } }>;
};

export type SummarizeDeps = {
  ollama?: SummarizeChat | null;
  model?: string;
  timeoutMs?: number;
};

export type ParseSummaryResult = { ok: true; text: string } | { ok: false; error: string };

export type SummarizeResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

export function buildSummaryPrompt(title: string, sourceText: string): string {
  const headline = title.trim() || '(no headline)';
  const text = sourceText.trim() || '(no text)';
  return `You summarise news stories for an OSINT news brief. Write a neutral summary of the story using ONLY facts stated in the source text below.

Headline: ${headline}

Source text:
"""
${text}
"""

Rules:
- One or two sentences, at most ${SUMMARY_MAX_CHARS} characters.
- State only facts that appear in the source text. Do not add background, context, or facts from outside the text.
- No speculation, predictions, or opinions.
- No evaluative adjectives (for example "shocking", "historic", "controversial", "major").
- Do not claim that anything is true, false, confirmed, or verified; attribute statements to who made them when the text does.
- No markdown, no commentary.

Respond with JSON only (no markdown fences) in this exact shape:
{ "summary": "string" }`;
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

const WRAPPING_QUOTES: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['\u201c', '\u201d'],
  ['\u2018', '\u2019'],
];

function stripWrappingQuotes(text: string): string {
  let current = text;
  for (;;) {
    const pair = WRAPPING_QUOTES.find(
      ([open, close]) => current.length >= 2 && current.startsWith(open) && current.endsWith(close),
    );
    if (!pair) return current;
    current = current.slice(1, -1).trim();
  }
}

/** Words whose trailing period doesn't end a sentence. */
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'gen', 'gov', 'sen', 'rep', 'no', 'vs', 'etc']);

function isAbbreviation(textBeforePeriod: string): boolean {
  const word = textBeforePeriod.match(/([A-Za-z.]+)$/)?.[1] ?? '';
  if (/^(?:[A-Za-z]\.)*[A-Za-z]$/.test(word)) return true;
  return ABBREVIATIONS.has(word.toLowerCase());
}

/** Cut after the Nth sentence end: [.!?] (+ closing quotes) followed by space and a capital/digit/quote. */
function firstSentences(text: string, max: number): string {
  const boundary = /([.!?])["'\u201d\u2019)\]]*(?=\s+["'\u201c\u2018(]?[A-Z0-9])/g;
  let count = 0;
  for (let match = boundary.exec(text); match; match = boundary.exec(text)) {
    if (match[1] === '.' && isAbbreviation(text.slice(0, match.index))) continue;
    count += 1;
    if (count === max) return text.slice(0, match.index + match[0].length);
  }
  return text;
}

/** `{ "summary": string }` → trimmed, unquoted, whitespace-collapsed, ≤ 2 sentences, length-checked. */
export function parseSummaryOutput(raw: string): ParseSummaryResult {
  let parsed: unknown;
  try {
    parsed = parseJsonResponse(raw);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Summary payload must be a JSON object' };
  }
  const summary = (parsed as Record<string, unknown>).summary;
  if (typeof summary !== 'string') {
    return { ok: false, error: 'Summary payload is missing "summary"' };
  }

  const collapsed = stripWrappingQuotes(summary.replace(/\s+/g, ' ').trim());
  const text = firstSentences(collapsed, SUMMARY_MAX_SENTENCES).trim();
  if (text.length < SUMMARY_MIN_CHARS) {
    return { ok: false, error: `Summary too short (${text.length} chars)` };
  }
  if (text.length > SUMMARY_MAX_CHARS) {
    return { ok: false, error: `Summary too long (${text.length} chars)` };
  }
  return { ok: true, text };
}

async function chatWithTimeout(
  ollama: SummarizeChat,
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Ollama API request timed out')), timeoutMs);
  });

  try {
    const callPromise = ollama.chat({
      model,
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      stream: false,
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const content = response?.message?.content;
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

/** One Ollama call for one story's source text. Never throws. */
export async function summarizeSource(
  source: { title: string; text: string },
  deps: SummarizeDeps = {},
): Promise<SummarizeResult> {
  try {
    const ollama = deps.ollama === undefined ? getOllamaClient() : deps.ollama;
    if (!ollama) return { ok: false, error: OLLAMA_NOT_CONFIGURED };
    if (!source.text.trim()) return { ok: false, error: 'No source text to summarise' };

    const model = deps.model ?? getOllamaModelName();
    const raw = await chatWithTimeout(
      ollama,
      model,
      buildSummaryPrompt(source.title, source.text),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const parsed = parseSummaryOutput(raw);
    return parsed.ok ? { ok: true, text: parsed.text, model } : parsed;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
