import type { EvidenceStance, SourceTier } from './claim.js';

export type BriefClaimVerbiage = {
  short_summary: string;
  talking_points: string[];
};

export type BriefClaimItem = {
  claimId: string;
  text: string;
  claimType: string;
  status: string;
  createdAt: string;
  confidence: number | null;
  evidence: {
    total: number;
    supports: number;
    contradicts: number;
    mentions: number;
    primary: number;
    sensor: number;
  };
  clusterKeys: string[];
  linkedHeadlines: Array<{
    id: string;
    title: string;
    sourceKind: string;
    publisherDomain: string | null;
    publishedAt: string | null;
    canonicalUrl: string;
    sourceTier: SourceTier;
    stance: EvidenceStance;
  }>;
  verbiage: BriefClaimVerbiage | null;
};

export type ClaimEnrichmentRecord = {
  claimId: string;
  enrichment: BriefClaimVerbiage | null;
  enrichedAt: string | null;
  enrichError: string | null;
  model: string | null;
};
