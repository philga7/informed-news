import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Organization } from '../types/osint';
import { organizationService } from '../services';
import { useAuth } from '../hooks/useAuth';

interface OrganizationWithRole extends Organization {
  userRole: 'owner' | 'admin' | 'analyst' | 'member';
  joinedAt: Date;
}

interface OrganizationContextValue {
  currentOrganization: OrganizationWithRole | null;
  organizations: OrganizationWithRole[];
  isLoading: boolean;
  switchOrganization: (orgId: string) => void;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

const STORAGE_KEY = 'current_organization_id';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Load organizations for the current user
   */
  const loadOrganizations = async () => {
    if (!user) {
      setOrganizations([]);
      setCurrentOrganization(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const userOrgs = await organizationService.getUserOrganizations(user.id);

      // If user has no organizations, create a "Personal" one
      if (userOrgs.length === 0) {
        console.log('👤 No organizations found, creating Personal organization...');
        const personalOrg = await organizationService.createOrganization(
          `${user.name || user.email}'s Workspace`,
          slugify(`${user.name || user.email}-workspace-${Date.now()}`),
          user.id
        );
        userOrgs.push(personalOrg);
      }

      setOrganizations(userOrgs);

      // Set current organization
      const savedOrgId = localStorage.getItem(STORAGE_KEY);
      const orgToSet = savedOrgId
        ? userOrgs.find(org => org.id === savedOrgId)
        : userOrgs[0];

      if (orgToSet) {
        setCurrentOrganization(orgToSet);
        localStorage.setItem(STORAGE_KEY, orgToSet.id);
        console.log(`🏢 Current organization: ${orgToSet.name}`);
      }
    } catch (error) {
      console.error('Error loading organizations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Switch to a different organization
   */
  const switchOrganization = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrganization(org);
      localStorage.setItem(STORAGE_KEY, orgId);
      console.log(`🔄 Switched to organization: ${org.name}`);
    }
  };

  /**
   * Refresh organizations list (e.g., after creating a new one)
   */
  const refreshOrganizations = async () => {
    await loadOrganizations();
  };

  // Load organizations when user authenticates
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadOrganizations();
    } else if (!authLoading && !isAuthenticated) {
      setOrganizations([]);
      setCurrentOrganization(null);
      setIsLoading(false);
    }
  }, [user, isAuthenticated, authLoading]);

  return (
    <OrganizationContext.Provider
      value={{
        currentOrganization,
        organizations,
        isLoading,
        switchOrganization,
        refreshOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

