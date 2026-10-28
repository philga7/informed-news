import type { CitationCheckItem } from '../../types/citationGuard.js';

/** Surfaces from a Brief full-story record used for citation extraction. */
export type ExtractCitationFullStory = {
  enrichment?: {
    talking_points?: string[];
    timeline?: Array<{ content?: string }>;
    suggested_qna?: Array<{ question?: string; answer?: string }>;
  } | null;
  deterministic?: {
    quote?: {
      quote?: string;
      quote_source_url?: string | null;
    } | null;
    perspectives?: Array<{
      text?: string;
      sources?: Array<{ url?: string }>;
    }>;
  };
  changeSummary?: string | null;
};

export type ExtractCitationItemsInput = {
  summaryText?: string | null;
  fullStory?: ExtractCitationFullStory | null;
};

/** http(s) URLs; trailing sentence punctuation is stripped. */
const URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi;

/** Reporters a court cite may use (longest first so `F. Supp. 2d` beats `F. Supp.`). */
const COURT_REPORTERS = [
  'U.S.', 'S. Ct.', 'L. Ed. 2d', 'L. Ed.', 'F.2d', 'F.3d', 'F.4th',
  'F. Supp. 3d', 'F. Supp. 2d', 'F. Supp.', 'S.E.2d', 'N.E.2d', 'N.E.3d',
  'P.2d', 'P.3d', 'So. 2d', 'So. 3d', 'A.2d', 'A.3d',
  'Cal. App.', 'Cal. 5th', 'Cal. 4th', 'Cal. 3d', 'Cal. 2d', 'Cal.',
  'N.Y.2d', 'N.Y.3d', 'N.Y.',
];

function reporterPattern(reporter: string): string {
  return reporter
    .split(' ')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
}

const COURT_CITE_RE = new RegExp(
  `(?<![\\w.])(\\d{1,4})\\s+(${COURT_REPORTERS.map(reporterPattern).join('|')})\\s+(\\d{1,5})(?!\\d)`,
  'g',
);

const COURT_URL_PATH_RE = /^\/(?:docket|recap|opinion)\//;

function isCourtUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      (host === 'courtlistener.com' || host === 'www.courtlistener.com') &&
      COURT_URL_PATH_RE.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function pushCourtUrl(url: string, items: CitationCheckItem[], seen: Set<string>): void {
  if (!isCourtUrl(url)) return;
  pushUnique(items, seen, { kind: 'court', url }, `court-url:${url}`);
}

function extractCourtCitesFromText(
  text: string,
  items: CitationCheckItem[],
  seen: Set<string>,
): void {
  COURT_CITE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COURT_CITE_RE.exec(text)) !== null) {
    const volume = match[1]!;
    const reporter = normalizeSpace(match[2]!);
    const page = match[3]!;
    const citation = `${volume} ${reporter} ${page}`;
    pushUnique(
      items,
      seen,
      { kind: 'court', citation, volume, reporter, page },
      `court:${citation}`,
    );
  }
}

/** Straight, curly, or single-quoted spans used as quotes. */
const QUOTE_RE =
  /"([^"\n]{1,500})"|'([^'\n]{1,500})'|\u201c([^\u201d\n]{1,500})\u201d|\u2018([^\u2019\n]{1,500})\u2019/g;

const REFUTE_RE =
  /\b(refut(?:e|ed|es|ing)|debunk(?:ed|ing|s)?|disproven|disproved|false\s+claim)\b/i;

function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?)]+$/g, '');
}

function pushUnique(
  items: CitationCheckItem[],
  seen: Set<string>,
  item: CitationCheckItem,
  key: string,
): void {
  if (seen.has(key)) return;
  seen.add(key);
  items.push(item);
}

function extractUrlsFromText(text: string, items: CitationCheckItem[], seen: Set<string>): void {
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    const url = trimUrl(match[0]!);
    if (!url) continue;
    pushUnique(items, seen, { kind: 'url', url }, `url:${url}`);
    pushCourtUrl(url, items, seen);
  }
}

function extractQuotesFromText(text: string, items: CitationCheckItem[], seen: Set<string>): void {
  QUOTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = QUOTE_RE.exec(text)) !== null) {
    const quote = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim();
    if (!quote) continue;
    pushUnique(items, seen, { kind: 'quote', quote }, `quote:${quote}`);
  }
}

function extractFromPlainText(
  text: string | null | undefined,
  items: CitationCheckItem[],
  seen: Set<string>,
): void {
  if (typeof text !== 'string' || !text.trim()) return;
  extractUrlsFromText(text, items, seen);
  extractQuotesFromText(text, items, seen);
  extractCourtCitesFromText(text, items, seen);
}

/**
 * When a talking point / Q&A answer pairs refute/debunk language with a URL,
 * emit a claim item with that refuting URL. Only when a URL is present.
 */
function extractRefutedClaims(
  text: string | null | undefined,
  items: CitationCheckItem[],
  seen: Set<string>,
): void {
  if (typeof text !== 'string' || !text.trim()) return;
  if (!REFUTE_RE.test(text)) return;

  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    const url = trimUrl(match[0]!);
    if (!url) continue;
    pushUnique(
      items,
      seen,
      { kind: 'claim', refutingUrl: url, claimText: text.trim() },
      `claim:${url}:${text.trim()}`,
    );
  }
}

/**
 * Extract citation check items from card summary text and/or a full-story record.
 * Covers: summary URLs/quotes; pull quote; perspectives; talking points;
 * timeline content; living-update notes; link-backed refute language → claim.
 */
export function extractCitationItems(input: ExtractCitationItemsInput): CitationCheckItem[] {
  const items: CitationCheckItem[] = [];
  const seen = new Set<string>();

  extractFromPlainText(input.summaryText, items, seen);

  const fullStory = input.fullStory;
  if (!fullStory) return items;

  const quote = fullStory.deterministic?.quote;
  if (quote?.quote?.trim()) {
    pushUnique(
      items,
      seen,
      { kind: 'quote', quote: quote.quote.trim() },
      `quote:${quote.quote.trim()}`,
    );
  }
  if (quote?.quote?.trim()) extractCourtCitesFromText(quote.quote, items, seen);
  if (typeof quote?.quote_source_url === 'string' && quote.quote_source_url.trim()) {
    const url = trimUrl(quote.quote_source_url.trim());
    pushUnique(items, seen, { kind: 'url', url }, `url:${url}`);
    pushCourtUrl(url, items, seen);
  }

  for (const perspective of fullStory.deterministic?.perspectives ?? []) {
    extractQuotesFromText(perspective.text ?? '', items, seen);
    extractCourtCitesFromText(perspective.text ?? '', items, seen);
    for (const source of perspective.sources ?? []) {
      if (typeof source.url === 'string' && source.url.trim()) {
        const url = trimUrl(source.url.trim());
        pushUnique(items, seen, { kind: 'url', url }, `url:${url}`);
        pushCourtUrl(url, items, seen);
      }
    }
  }

  for (const point of fullStory.enrichment?.talking_points ?? []) {
    extractFromPlainText(point, items, seen);
    extractRefutedClaims(point, items, seen);
  }

  for (const event of fullStory.enrichment?.timeline ?? []) {
    extractFromPlainText(event.content, items, seen);
  }

  for (const qa of fullStory.enrichment?.suggested_qna ?? []) {
    extractFromPlainText(qa.question, items, seen);
    extractFromPlainText(qa.answer, items, seen);
    extractRefutedClaims(qa.answer, items, seen);
  }

  extractFromPlainText(fullStory.changeSummary, items, seen);

  return items;
}
