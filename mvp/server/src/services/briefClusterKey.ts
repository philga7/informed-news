/**
 * Canonical cluster key for Brief, Radar, enrich, and Accept membership.
 * Uses existing `clusterId` when set; otherwise `solo:{articleId}`.
 */
export function briefClusterKey(article: {
  id: string;
  clusterId: string | null;
}): string {
  const clusterId = article.clusterId?.trim();
  return clusterId && clusterId.length > 0 ? clusterId : `solo:${article.id}`;
}

export function isSoloClusterKey(key: string): boolean {
  return key.startsWith('solo:');
}
