const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'ocid', 'cmpid', 'oc']);

function isTrackingParam(pair: string): boolean {
  const rawName = pair.split('=', 1)[0] ?? '';
  let name: string;
  try {
    name = decodeURIComponent(rawName.replace(/\+/g, ' '));
  } catch {
    name = rawName;
  }
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

/**
 * Canonical form of a search result / Google News link for identity and matching:
 * http(s) only, no fragment, no tracking params, lowercase host. Invalid → null.
 */
export function canonicalizeSearchUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  // Filter raw pairs so kept params keep their original encoding.
  const kept = parsed.search
    .slice(1)
    .split('&')
    .filter((pair) => pair !== '' && !isTrackingParam(pair));
  parsed.search = kept.length > 0 ? `?${kept.join('&')}` : '';
  return parsed.toString();
}

/** Lowercase, accent-free, punctuation collapsed to single spaces — for same-story title matching. */
export function normalizeTitleForMatch(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
