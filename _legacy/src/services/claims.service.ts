import type {
  Claim,
  ClaimEvidence,
  ClaimWithEvidence,
  CorroborationMatrix,
  ClaimType,
} from '../types/osint';

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

export const claimsService = {
  /**
   * Get all claims for a topic with evidence and corroboration status
   */
  async getClaimsByTopic(topicId: string): Promise<ClaimWithEvidence[]> {
    const response = await fetch(
      `${API_BASE}/api/claims?topic_id=${topicId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch claims: ${response.statusText}`);
    }

    const data = await response.json();

    // Convert dates
    return data.claims.map((claim: any) => ({
      ...claim,
      claimText: claim.claim_text,
      claimType: claim.claim_type,
      isFalsifiable: claim.is_falsifiable,
      topicId: claim.topic_id,
      createdByUserId: claim.created_by_user_id,
      createdAt: new Date(claim.created_at),
      updatedAt: new Date(claim.updated_at),
      corroborationStatus: claim.corroboration_status,
      evidenceCounts: claim.evidence_counts,
      evidence: claim.evidence.map((e: any) => ({
        ...e,
        claimId: e.claim_id,
        linkId: e.link_id,
        evidenceExcerpt: e.evidence_excerpt,
        analystNotes: e.analyst_notes,
        createdByUserId: e.created_by_user_id,
        createdAt: new Date(e.created_at),
        updatedAt: new Date(e.updated_at),
        link: {
          ...e.link,
          sourceRecordId: e.link.source_record_id,
        },
      })),
    }));
  },

  /**
   * Create a new claim
   */
  async createClaim(
    topicId: string,
    claimText: string,
    options?: {
      claimType?: ClaimType;
      isFalsifiable?: boolean;
      createdByUserId?: string;
    }
  ): Promise<Claim> {
    const response = await fetch(`${API_BASE}/api/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic_id: topicId,
        claim_text: claimText,
        claim_type: options?.claimType,
        is_falsifiable: options?.isFalsifiable,
        created_by_user_id: options?.createdByUserId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create claim: ${response.statusText}`);
    }

    const data = await response.json();
    const claim = data.claim;

    return {
      id: claim.id,
      topicId: claim.topic_id,
      claimText: claim.claim_text,
      claimType: claim.claim_type,
      isFalsifiable: claim.is_falsifiable,
      createdByUserId: claim.created_by_user_id,
      createdAt: new Date(claim.created_at),
      updatedAt: new Date(claim.updated_at),
    };
  },

  /**
   * Update a claim
   */
  async updateClaim(
    claimId: string,
    updates: {
      claimText?: string;
      claimType?: ClaimType;
      isFalsifiable?: boolean;
    }
  ): Promise<Claim> {
    const response = await fetch(`${API_BASE}/api/claims/${claimId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        claim_text: updates.claimText,
        claim_type: updates.claimType,
        is_falsifiable: updates.isFalsifiable,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update claim: ${response.statusText}`);
    }

    const data = await response.json();
    const claim = data.claim;

    return {
      id: claim.id,
      topicId: claim.topic_id,
      claimText: claim.claim_text,
      claimType: claim.claim_type,
      isFalsifiable: claim.is_falsifiable,
      createdByUserId: claim.created_by_user_id,
      createdAt: new Date(claim.created_at),
      updatedAt: new Date(claim.updated_at),
    };
  },

  /**
   * Delete a claim
   */
  async deleteClaim(claimId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/claims/${claimId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete claim: ${response.statusText}`);
    }
  },

  /**
   * Add evidence for a claim
   */
  async addEvidence(
    claimId: string,
    linkId: string,
    options?: {
      supports?: boolean | null;
      evidenceExcerpt?: string;
      analystNotes?: string;
      createdByUserId?: string;
    }
  ): Promise<ClaimEvidence> {
    const response = await fetch(`${API_BASE}/api/claims/${claimId}/evidence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        link_id: linkId,
        supports: options?.supports,
        evidence_excerpt: options?.evidenceExcerpt,
        analyst_notes: options?.analystNotes,
        created_by_user_id: options?.createdByUserId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to add evidence: ${response.statusText}`);
    }

    const data = await response.json();
    const evidence = data.evidence;

    return {
      id: evidence.id,
      claimId: evidence.claim_id,
      linkId: evidence.link_id,
      supports: evidence.supports,
      evidenceExcerpt: evidence.evidence_excerpt,
      analystNotes: evidence.analyst_notes,
      createdByUserId: evidence.created_by_user_id,
      createdAt: new Date(evidence.created_at),
      updatedAt: new Date(evidence.updated_at),
    };
  },

  /**
   * Update claim evidence
   */
  async updateEvidence(
    claimId: string,
    evidenceId: string,
    updates: {
      supports?: boolean | null;
      evidenceExcerpt?: string;
      analystNotes?: string;
    }
  ): Promise<ClaimEvidence> {
    const response = await fetch(
      `${API_BASE}/api/claims/${claimId}/evidence/${evidenceId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supports: updates.supports,
          evidence_excerpt: updates.evidenceExcerpt,
          analyst_notes: updates.analystNotes,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update evidence: ${response.statusText}`);
    }

    const data = await response.json();
    const evidence = data.evidence;

    return {
      id: evidence.id,
      claimId: evidence.claim_id,
      linkId: evidence.link_id,
      supports: evidence.supports,
      evidenceExcerpt: evidence.evidence_excerpt,
      analystNotes: evidence.analyst_notes,
      createdByUserId: evidence.created_by_user_id,
      createdAt: new Date(evidence.created_at),
      updatedAt: new Date(evidence.updated_at),
    };
  },

  /**
   * Delete claim evidence
   */
  async deleteEvidence(claimId: string, evidenceId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/claims/${claimId}/evidence/${evidenceId}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete evidence: ${response.statusText}`);
    }
  },

  /**
   * Get corroboration matrix for a topic
   */
  async getCorroborationMatrix(topicId: string): Promise<CorroborationMatrix> {
    const response = await fetch(
      `${API_BASE}/api/claims/topic/${topicId}/matrix`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch corroboration matrix: ${response.statusText}`);
    }

    const data = await response.json();
    const matrix = data.matrix;

    return {
      topicId: matrix.topic_id,
      claims: matrix.claims.map((c: any) => ({
        id: c.id,
        claimText: c.claim_text,
        claimType: c.claim_type,
      })),
      sources: matrix.sources.map((s: any) => ({
        linkId: s.link_id,
        sourceRecordId: s.source_record_id,
        sourceName: s.source_name,
        sourceUrl: s.source_url || null,
        scrapeExternalUrl: s.scrape_external_url || false,
      })),
      matrix: matrix.matrix.map((cell: any) => ({
        claimId: cell.claim_id,
        linkId: cell.link_id,
        sourceRecordId: cell.source_record_id,
        sourceName: cell.source_name,
        sourceUrl: cell.source_url || null,
        scrapeExternalUrl: cell.scrape_external_url || false,
        supports: cell.supports,
        evidenceExcerpt: cell.evidence_excerpt,
      })),
    };
  },
};

