import type { MuteRule } from '../store/muteRulesStore.js';

export type MuteArticleLike = {
  title?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  publisherTitle?: string | null;
  citationLabel?: string | null;
  publisherDomain?: string | null;
  publisherUrl?: string | null;
  canonicalUrl?: string | null;
  handle?: string | null;
  sourceKind?: string | null;
  citations?: Array<{ label: string; url: string }> | null;
};

export type MuteClusterLike = {
  headlines?: MuteArticleLike[] | null;
  articles?: MuteArticleLike[] | null;
  members?: MuteArticleLike[] | null;
};

function normalizeText(raw: string | null | undefined): string {
  return (raw ?? '').toLowerCase();
}

function hostnameFromUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function articleHaystack(article: MuteArticleLike): string {
  return [
    article.title,
    article.publisherTitle,
    article.snippet,
    article.bodyText,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join('\n')
    .toLowerCase();
}

function sourceCandidates(article: MuteArticleLike): string[] {
  const candidates: string[] = [];
  const push = (v: string | null | undefined) => {
    if (!v) return;
    const trimmed = v.trim();
    if (trimmed.length === 0) return;
    candidates.push(trimmed.toLowerCase());
  };

  push(article.publisherDomain);
  push(article.citationLabel);
  push(article.handle);
  push(article.sourceKind);

  const canonicalHost = hostnameFromUrl(article.canonicalUrl);
  if (canonicalHost) candidates.push(canonicalHost);

  const publisherHost = hostnameFromUrl(article.publisherUrl);
  if (publisherHost) candidates.push(publisherHost);

  for (const c of article.citations ?? []) {
    push(c.label);
    const host = hostnameFromUrl(c.url);
    if (host) candidates.push(host);
  }

  return candidates;
}

function matchesSource(ruleSource: string, article: MuteArticleLike): boolean {
  const needle = normalizeText(ruleSource.trim());
  if (!needle) return false;
  return sourceCandidates(article).some((candidate) => candidate.includes(needle));
}

function headlineHaystack(article: MuteArticleLike): string {
  return [article.title, article.snippet]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join('\n')
    .toLowerCase();
}

export function articleMatchesMute(
  article: MuteArticleLike,
  rules: Iterable<MuteRule>,
): boolean {
  const haystack = articleHaystack(article);

  for (const rule of rules) {
    const keyword = normalizeText(rule.keyword?.trim());
    if (!keyword) {
      continue;
    }

    if (!haystack.includes(keyword)) {
      continue;
    }

    if (rule.source && !matchesSource(rule.source, article)) {
      continue;
    }

    return true;
  }

  return false;
}

/**
 * A claim is muted if any rule keyword matches the claim text OR any linked
 * headline title/snippet. When rule.source is set, it must match at least one
 * linked article's source candidates.
 */
export function claimMatchesMute(
  claim: { text: string },
  linkedArticles: ReadonlyArray<MuteArticleLike>,
  rules: Iterable<MuteRule>,
): boolean {
  const claimText = normalizeText(claim.text);

  for (const rule of rules) {
    const keyword = normalizeText(rule.keyword?.trim());
    if (!keyword) {
      continue;
    }

    const keywordMatched =
      claimText.includes(keyword) ||
      linkedArticles.some((a) => headlineHaystack(a).includes(keyword));

    if (!keywordMatched) {
      continue;
    }

    if (rule.source) {
      const ok = linkedArticles.some((a) => matchesSource(rule.source!, a));
      if (!ok) {
        continue;
      }
    }

    return true;
  }

  return false;
}

/**
 * A cluster is muted if any member headline/article matches a rule.
 * Supports Radar clusters (`headlines`) or article clusters (`articles`/`members`).
 */
export function clusterMatchesMute(
  cluster: MuteClusterLike,
  rules: Iterable<MuteRule>,
): boolean {
  const lists: Array<ReadonlyArray<MuteArticleLike>> = [];
  if (Array.isArray(cluster.headlines)) lists.push(cluster.headlines);
  if (Array.isArray(cluster.articles)) lists.push(cluster.articles);
  if (Array.isArray(cluster.members)) lists.push(cluster.members);

  for (const members of lists) {
    for (const member of members) {
      if (articleMatchesMute(member, rules)) {
        return true;
      }
    }
  }
  return false;
}

