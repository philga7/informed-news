import type { Article, BodyStatus } from './types';

export function titlesDiffer(
  headline: string,
  publisherTitle: string | null,
): boolean {
  if (!publisherTitle?.trim()) return false;
  return headline.trim().toLowerCase() !== publisherTitle.trim().toLowerCase();
}

function publisherBodyMissing(status: BodyStatus, bodyText: string | null): boolean {
  if (status === 'ok' && Boolean(bodyText?.trim())) return false;
  return status === 'unavailable' || status === 'blocked' || status === 'pending';
}

/**
 * Plain-language selection/omission signals for CFP items.
 * Honest cues — not a truth verdict or partisan blindspot score.
 */
export function selectionSignals(article: Article): string[] {
  if (article.sourceKind !== 'cfp') return [];

  const notes: string[] = [];

  if (titlesDiffer(article.title, article.publisherTitle)) {
    notes.push(
      'CFP headline differs from the publisher’s — selection may be framing. Not a truth verdict.',
    );
  }

  if (publisherBodyMissing(article.bodyStatus, article.bodyText)) {
    notes.push(
      'Publisher original text isn’t available here — what CFP selected may omit context.',
    );
  }

  return notes;
}
