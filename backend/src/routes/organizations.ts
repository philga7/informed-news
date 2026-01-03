import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * GET /api/organizations
 * Get all organizations for a user
 * Query params: user_id (required)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Get organizations through org_members join
    const { data: memberships, error } = await supabase
      .from('org_members')
      .select(`
        id,
        role,
        joined_at,
        organizations (
          id,
          name,
          slug,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', user_id as string)
      .order('joined_at', { ascending: false });

    if (error) throw error;

    // Transform data to include role with organization
    const organizations = memberships?.map((membership: any) => ({
      ...membership.organizations,
      userRole: membership.role,
      joinedAt: membership.joined_at,
    })) || [];

    res.json({
      success: true,
      organizations,
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({
      error: 'Failed to fetch organizations',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/organizations
 * Create a new organization
 * Body: { name, slug, user_id }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, slug, user_id } = req.body;

    if (!name || !slug || !user_id) {
      return res.status(400).json({ error: 'name, slug, and user_id are required' });
    }

    // Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug,
      })
      .select()
      .single();

    if (orgError) {
      // Handle unique constraint violation
      if (orgError.code === '23505') {
        return res.status(409).json({
          error: 'An organization with this slug already exists',
        });
      }
      throw orgError;
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from('org_members')
      .insert({
        organization_id: organization.id,
        user_id,
        role: 'owner',
      });

    if (memberError) throw memberError;

    res.status(201).json({
      success: true,
      organization: {
        ...(organization as any),
        userRole: 'owner',
      },
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({
      error: 'Failed to create organization',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/organizations/:id
 * Update an organization
 * Body: { name?, slug? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug } = req.body;

    if (!name && !slug) {
      return res.status(400).json({ error: 'At least one field (name or slug) is required' });
    }

    const updates: any = {};
    if (name) updates.name = name;
    if (slug) updates.slug = slug;

    const { data: organization, error } = await supabase
      .from('organizations')
      // @ts-ignore - Supabase type inference issue in serverless environment
      .update(updates as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'An organization with this slug already exists',
        });
      }
      throw error;
    }

    res.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({
      error: 'Failed to update organization',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/organizations/:id/members
 * Get all members of an organization
 */
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: members, error } = await supabase
      .from('org_members')
      .select(`
        id,
        role,
        joined_at,
        profiles (
          id,
          email,
          name
        )
      `)
      .eq('organization_id', id)
      .order('joined_at', { ascending: true });

    if (error) throw error;

    // Transform data
    const formattedMembers = members?.map((member: any) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joined_at,
      user: member.profiles,
    })) || [];

    res.json({
      success: true,
      members: formattedMembers,
    });
  } catch (error) {
    console.error('Error fetching organization members:', error);
    res.status(500).json({
      error: 'Failed to fetch organization members',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/organizations/:id/members
 * Invite a member to an organization
 * Body: { user_id, role }
 */
router.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, role } = req.body;

    if (!user_id || !role) {
      return res.status(400).json({ error: 'user_id and role are required' });
    }

    if (!['owner', 'admin', 'analyst', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: member, error } = await supabase
      .from('org_members')
      // @ts-ignore - Supabase type inference issue in serverless environment
      .insert({
        organization_id: id,
        user_id,
        role,
      } as any)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'User is already a member of this organization',
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      member,
    });
  } catch (error) {
    console.error('Error adding organization member:', error);
    res.status(500).json({
      error: 'Failed to add organization member',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/organizations/:orgId/members/:memberId
 * Update a member's role
 * Body: { role }
 */
router.patch('/:orgId/members/:memberId', async (req: Request, res: Response) => {
  try {
    const { orgId, memberId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'role is required' });
    }

    if (!['owner', 'admin', 'analyst', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: member, error } = await supabase
      .from('org_members')
      // @ts-ignore - Supabase type inference issue in serverless environment
      .update({ role } as any)
      .eq('id', memberId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      member,
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({
      error: 'Failed to update member role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/organizations/:orgId/members/:memberId
 * Remove a member from an organization
 */
router.delete('/:orgId/members/:memberId', async (req: Request, res: Response) => {
  try {
    const { orgId, memberId } = req.params;

    const { error } = await supabase
      .from('org_members')
      .delete()
      .eq('id', memberId)
      .eq('organization_id', orgId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    console.error('Error removing organization member:', error);
    res.status(500).json({
      error: 'Failed to remove organization member',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/organizations/:id/can-delete
 * Check if an organization can be deleted (has no artifacts)
 */
router.get('/:id/can-delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Count sources
    const { count: sourcesCount, error: sourcesError } = await supabase
      .from('sources')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id);

    if (sourcesError) throw sourcesError;

    // Count topics
    const { count: topicsCount, error: topicsError } = await supabase
      .from('osint_topics')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id);

    if (topicsError) throw topicsError;

    // Count artifacts
    const { count: artifactsCount, error: artifactsError } = await supabase
      .from('analytic_artifacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id);

    if (artifactsError) throw artifactsError;

    const canDelete = sourcesCount === 0 && topicsCount === 0 && artifactsCount === 0;

    res.json({
      success: true,
      canDelete,
      blockers: {
        sources: sourcesCount || 0,
        topics: topicsCount || 0,
        artifacts: artifactsCount || 0,
      },
    });
  } catch (error) {
    console.error('Error checking if organization can be deleted:', error);
    res.status(500).json({
      error: 'Failed to check deletion eligibility',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/organizations/:fromId/transfer/:toId
 * Transfer all artifacts from one organization to another
 * Body: { transfer_sources?, transfer_topics?, transfer_artifacts? }
 */
router.post('/:fromId/transfer/:toId', async (req: Request, res: Response) => {
  try {
    const { fromId, toId } = req.params;
    const { 
      transfer_sources = true, 
      transfer_topics = true, 
      transfer_artifacts = true 
    } = req.body;

    const transferred = {
      sources: 0,
      topics: 0,
      sourceRecords: 0,
      artifacts: 0,
    };

    // Transfer sources (and their source_records via CASCADE)
    if (transfer_sources) {
      const { error: sourcesError } = await supabase
        .from('sources')
        // @ts-ignore - Supabase type inference issue in serverless environment
        .update({ organization_id: toId } as any)
        .eq('organization_id', fromId);

      if (sourcesError) throw sourcesError;

      // Count transferred sources
      const { count } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', toId);

      transferred.sources = count || 0;
    }

    // Transfer topics
    if (transfer_topics) {
      // Handle potential name conflicts by appending " (transferred)"
      const { data: existingTopics } = await supabase
        .from('osint_topics')
        .select('name')
        .eq('organization_id', toId);

      const existingNames = new Set(existingTopics?.map((t: any) => t.name) || []);

      const { data: topicsToTransfer } = await supabase
        .from('osint_topics')
        .select('id, name')
        .eq('organization_id', fromId);

      // Update each topic, handling name conflicts
      const topicsTyped = (topicsToTransfer || []) as any[];
      for (const topic of topicsTyped) {
        let newName = topic.name;
        if (existingNames.has(topic.name)) {
          newName = `${topic.name} (transferred)`;
        }

        const { error } = await supabase
          .from('osint_topics')
          // @ts-ignore - Supabase type inference issue in serverless environment
          .update({ 
            organization_id: toId,
            name: newName,
          } as any)
          .eq('id', topic.id);

        if (error) throw error;
        transferred.topics++;
      }
    }

    // Transfer artifacts
    if (transfer_artifacts) {
      const { error: artifactsError } = await supabase
        .from('analytic_artifacts')
        // @ts-ignore - Supabase type inference issue in serverless environment
        .update({ organization_id: toId } as any)
        .eq('organization_id', fromId);

      if (artifactsError) throw artifactsError;

      const { count } = await supabase
        .from('analytic_artifacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', toId);

      transferred.artifacts = count || 0;
    }

    res.json({
      success: true,
      transferred,
    });
  } catch (error) {
    console.error('Error transferring artifacts:', error);
    res.status(500).json({
      error: 'Failed to transfer artifacts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/organizations/:id
 * Delete an organization (only if empty)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if organization can be deleted
    const canDeleteResponse = await fetch(`${req.protocol}://${req.get('host')}/api/organizations/${id}/can-delete`);
    const canDeleteData = await canDeleteResponse.json();

    if (!canDeleteData.canDelete) {
      return res.status(400).json({
        error: 'Organization has artifacts and cannot be deleted',
        blockers: canDeleteData.blockers,
      });
    }

    // Delete organization (will cascade to org_members)
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Organization deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting organization:', error);
    res.status(500).json({
      error: 'Failed to delete organization',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

