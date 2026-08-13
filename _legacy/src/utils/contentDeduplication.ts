/**
 * Content Deduplication Utility
 * 
 * Removes duplicate paragraphs and sentences from content to fix
 * issues where RSS descriptions are duplicated in article content.
 */

/**
 * Remove consecutive duplicate paragraphs from content
 */
export function deduplicateContent(content: string | null | undefined): string {
  if (!content) return '';

  // Split content into paragraphs (by double newlines or single newlines)
  const paragraphs = content.split(/\n\s*\n|\n+/).filter(p => p.trim().length > 0);

  if (paragraphs.length === 0) return content;

  const deduplicated: string[] = [];
  const seen = new Set<string>();

  for (const paragraph of paragraphs) {
    // Normalize paragraph for comparison (lowercase, trim, remove extra spaces)
    const normalized = paragraph
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 200); // Compare first 200 chars to catch duplicates

    // Skip if we've seen this paragraph recently (within last 2 paragraphs)
    // This handles cases where description appears twice at the start
    if (seen.has(normalized)) {
      continue;
    }

    // Add to seen set (keep last 3 normalized paragraphs in memory)
    seen.add(normalized);
    if (seen.size > 3) {
      // Remove oldest entry (simple FIFO)
      const first = seen.values().next().value;
      if (first) {
        seen.delete(first);
      }
    }

    deduplicated.push(paragraph);
  }

  // Join paragraphs back with double newlines
  return deduplicated.join('\n\n');
}

/**
 * Remove duplicate sentences within the same paragraph
 */
export function deduplicateSentences(text: string): string {
  if (!text) return '';

  // Split by sentence endings
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  if (sentences.length <= 1) return text;

  const seen = new Set<string>();
  const deduplicated: string[] = [];

  for (const sentence of sentences) {
    const normalized = sentence
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');

    // Skip exact duplicates
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduplicated.push(sentence.trim());
  }

  return deduplicated.join(' ').trim();
}

/**
 * Comprehensive deduplication: removes both duplicate paragraphs and sentences
 */
export function deduplicateContentComprehensive(content: string | null | undefined): string {
  if (!content) return '';

  // First remove duplicate paragraphs
  let deduplicated = deduplicateContent(content);

  // Then remove duplicate sentences within each paragraph
  const paragraphs = deduplicated.split(/\n\s*\n/);
  const cleanedParagraphs = paragraphs.map(p => deduplicateSentences(p.trim()));

  return cleanedParagraphs.filter(p => p.length > 0).join('\n\n');
}

