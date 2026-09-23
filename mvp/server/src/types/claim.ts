export type ClaimType =
  | 'event_occurrence'
  | 'attribution'
  | 'casualty_or_count'
  | 'official_statement'
  | 'territorial_or_control';

export type ClaimStatus =
  | 'reported'
  | 'supported_by_primary'
  | 'contested'
  | 'insufficient_evidence';

export type EvidenceStance = 'supports' | 'contradicts' | 'mentions';

export type SourceTier = 'primary' | 'sensor';

export type Claim = {
  id: string;
  text: string;
  claimType: ClaimType;
  status: ClaimStatus;
  entities: string[];
  createdAt: string; // ISO
  domain: 'conflict';
};

export type EvidenceLink = {
  id: string;
  claimId: string;
  articleId: string | null;
  url: string | null; // at least one of articleId / url required on write
  stance: EvidenceStance;
  sourceTier: SourceTier;
  confidence: number; // 0..1
  /** Optional TypeSafe score bag; opaque to status derivation in v1. */
  scores: Record<string, number> | null;
  createdAt: string; // ISO
};

export type ClaimMembership = {
  acceptedClaimIds: string[];
  updatedAt: string | null;
};

export type TrackedClaimEntry = {
  claimId: string;
  trackedAt: string;
  pendingUpdate: boolean;
};

export type TrackedClaims = {
  entries: TrackedClaimEntry[];
  updatedAt: string | null;
};
