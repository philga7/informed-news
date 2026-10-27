/**
 * Normalize quote / source text for citation matching (NEWS-172 grill):
 * collapse whitespace; map curly quotes to straight. Nothing else
 * (case-sensitive; ellipses and [bracketed] insertions unchanged).
 */
export function normalizeQuote(text: string): string {
  const curlyMapped = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  return curlyMapped.replace(/\s+/gu, ' ').trim();
}
