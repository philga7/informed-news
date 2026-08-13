import type { Organization, OrgMember } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface OrganizationWithRole extends Organization {
  userRole: 'owner' | 'admin' | 'analyst' | 'member';
  joinedAt: Date;
}

interface MemberWithUser extends Omit<OrgMember, 'userId'> {
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

interface CanDeleteResponse {
  canDelete: boolean;
  blockers: {
    sources: number;
    topics: number;
    artifacts: number;
  };
}

interface TransferResult {
  transferred: {
    sources: number;
    topics: number;
    sourceRecords: number;
    artifacts: number;
  };
}

export const organizationService = {
  /**
   * Get all organizations for a user
   */
  async getUserOrganizations(userId: string): Promise<OrganizationWithRole[]> {
    const response = await fetch(
      `${API_BASE}/api/organizations?user_id=${userId}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch organizations: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert string dates to Date objects
    return data.organizations.map((org: any) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: new Date(org.created_at),
      updatedAt: new Date(org.updated_at),
      userRole: org.userRole,
      joinedAt: new Date(org.joinedAt),
    }));
  },

  /**
   * Create a new organization
   */
  async createOrganization(
    name: string, 
    slug: string, 
    userId: string
  ): Promise<OrganizationWithRole> {
    const response = await fetch(`${API_BASE}/api/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, slug, user_id: userId }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create organization: ${response.statusText}`);
    }
    
    const data = await response.json();
    const org = data.organization;
    
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: new Date(org.created_at),
      updatedAt: new Date(org.updated_at),
      userRole: org.userRole,
      joinedAt: new Date(),
    };
  },

  /**
   * Update an organization
   */
  async updateOrganization(
    id: string, 
    updates: { name?: string; slug?: string }
  ): Promise<Organization> {
    const response = await fetch(`${API_BASE}/api/organizations/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update organization: ${response.statusText}`);
    }
    
    const data = await response.json();
    const org = data.organization;
    
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: new Date(org.created_at),
      updatedAt: new Date(org.updated_at),
    };
  },

  /**
   * Get members of an organization
   */
  async getMembers(orgId: string): Promise<MemberWithUser[]> {
    const response = await fetch(
      `${API_BASE}/api/organizations/${orgId}/members`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch members: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return data.members.map((member: any) => ({
      id: member.id,
      organizationId: orgId,
      role: member.role,
      joinedAt: new Date(member.joinedAt),
      user: member.user,
    }));
  },

  /**
   * Invite a member to an organization
   */
  async inviteMember(
    orgId: string, 
    userId: string, 
    role: 'owner' | 'admin' | 'analyst' | 'member'
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/organizations/${orgId}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, role }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to invite member: ${response.statusText}`);
    }
  },

  /**
   * Update a member's role
   */
  async updateMemberRole(
    orgId: string, 
    memberId: string, 
    role: 'owner' | 'admin' | 'analyst' | 'member'
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/organizations/${orgId}/members/${memberId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update member role: ${response.statusText}`);
    }
  },

  /**
   * Remove a member from an organization
   */
  async removeMember(orgId: string, memberId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/organizations/${orgId}/members/${memberId}`,
      {
        method: 'DELETE',
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to remove member: ${response.statusText}`);
    }
  },

  /**
   * Check if an organization can be deleted (has no artifacts)
   */
  async canDeleteOrganization(orgId: string): Promise<CanDeleteResponse> {
    const response = await fetch(
      `${API_BASE}/api/organizations/${orgId}/can-delete`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to check deletion eligibility: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      canDelete: data.canDelete,
      blockers: data.blockers,
    };
  },

  /**
   * Transfer all artifacts from one organization to another
   */
  async transferArtifacts(
    fromOrgId: string, 
    toOrgId: string,
    options?: { 
      transferSources?: boolean;
      transferTopics?: boolean;
      transferArtifacts?: boolean;
    }
  ): Promise<TransferResult> {
    const response = await fetch(
      `${API_BASE}/api/organizations/${fromOrgId}/transfer/${toOrgId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transfer_sources: options?.transferSources ?? true,
          transfer_topics: options?.transferTopics ?? true,
          transfer_artifacts: options?.transferArtifacts ?? true,
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to transfer artifacts: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      transferred: data.transferred,
    };
  },

  /**
   * Delete an organization (only succeeds if no artifacts remain)
   */
  async deleteOrganization(orgId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/organizations/${orgId}`,
      {
        method: 'DELETE',
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete organization: ${response.statusText}`);
    }
  },
};

