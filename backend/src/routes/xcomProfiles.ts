import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import { auditService } from '../services/auditService.js';

const router = Router();

/**
 * Helper function to extract user ID from request (from Supabase auth header)
 */
function getUserId(req: Request): string | null {
  // Extract from Authorization header if present
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    // In production, decode JWT token to get user ID
    // For now, we'll rely on RLS policies which use auth.uid()
    return null; // Will be set by RLS policy via auth.uid()
  }
  // Fallback: try to get from request body if passed explicitly
  return (req.body?.userId as string) || null;
}

/**
 * GET /api/xcom-profiles
 * Get all profiles for an organization (ordered by display_order)
 * Query params: organization_id (required)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    // @ts-ignore - Supabase type inference issue with new xcom_profiles table
    const { data: profiles, error } = await supabase
      .from('xcom_profiles')
      .select('*')
      .eq('organization_id', organization_id as string)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      profiles: profiles || [],
    });
  } catch (error) {
    console.error('Error fetching X.com profiles:', error);
    res.status(500).json({
      error: 'Failed to fetch X.com profiles',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/xcom-profiles/:id
 * Get a single profile by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // @ts-ignore - Supabase type inference issue with new xcom_profiles table
    const { data: profile, error } = await supabase
      .from('xcom_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'X.com profile not found' });
      }
      throw error;
    }

    if (!profile) {
      return res.status(404).json({ error: 'X.com profile not found' });
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Error fetching X.com profile:', error);
    res.status(500).json({
      error: 'Failed to fetch X.com profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/xcom-profiles
 * Create a new profile
 * Body: { organization_id, username, display_name?, display_order?, settings?, enabled? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, username, display_name, display_order, settings, enabled } = req.body;

    if (!organization_id || !username) {
      return res.status(400).json({ 
        error: 'organization_id and username are required' 
      });
    }

    // Strip @ from username if present
    const cleanUsername = username.replace(/^@/, '');

    // Validate username format
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).json({ 
        error: 'Username must contain only letters, numbers, and underscores' 
      });
    }

    // @ts-ignore - Supabase type inference issue with new xcom_profiles table
    const { data: profile, error } = await supabase
      .from('xcom_profiles')
      .insert({
        organization_id,
        username: cleanUsername,
        display_name: display_name || null,
        display_order: display_order ?? 0,
        settings: settings || {},
        enabled: enabled !== undefined ? enabled : true,
      } as any)
      .select()
      .single();

    if (error) {
      // Handle duplicate key error
      if (error.code === '23505') {
        return res.status(409).json({ 
          error: 'A profile with this username already exists for this organization' 
        });
      }
      throw error;
    }

    // Log audit action
    const userId = getUserId(req);
    const profileTyped = profile as any;
    await auditService.logAction({
      action: 'xcom_profile_created',
      entityType: 'xcom_profile',
      entityId: profileTyped.id,
      userId,
      afterState: {
        organization_id: profileTyped.organization_id,
        username: profileTyped.username,
        display_name: profileTyped.display_name,
        enabled: profileTyped.enabled,
      },
    });

    res.status(201).json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Error creating X.com profile:', error);
    res.status(500).json({
      error: 'Failed to create X.com profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/xcom-profiles/:id
 * Update a profile
 * Body: { username?, display_name?, display_order?, settings?, enabled? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, display_name, display_order, settings, enabled } = req.body;

    // Get existing profile for audit trail
    const { data: existingProfile, error: fetchError } = await supabase
      .from('xcom_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingProfile) {
      return res.status(404).json({ error: 'X.com profile not found' });
    }

    // Prepare update object
    const updates: any = {};
    if (username !== undefined) {
      // Strip @ from username if present
      const cleanUsername = username.replace(/^@/, '');
      if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
        return res.status(400).json({ 
          error: 'Username must contain only letters, numbers, and underscores' 
        });
      }
      updates.username = cleanUsername;
    }
    if (display_name !== undefined) updates.display_name = display_name;
    if (display_order !== undefined) updates.display_order = display_order;
    if (settings !== undefined) updates.settings = settings;
    if (enabled !== undefined) updates.enabled = enabled;

    // @ts-ignore - Supabase type inference issue with new xcom_profiles table
    const { data: profile, error } = await supabase
      .from('xcom_profiles')
      // @ts-ignore - Supabase type inference issue with new xcom_profiles table
      .update(updates as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // Handle duplicate key error
      if (error.code === '23505') {
        return res.status(409).json({ 
          error: 'A profile with this username already exists for this organization' 
        });
      }
      throw error;
    }

    // Log audit action
    const userId = getUserId(req);
    const existingProfileTyped = existingProfile as any;
    const profileTyped = profile as any;
    await auditService.logAction({
      action: 'xcom_profile_updated',
      entityType: 'xcom_profile',
      entityId: id,
      userId,
      beforeState: {
        username: existingProfileTyped.username,
        display_name: existingProfileTyped.display_name,
        display_order: existingProfileTyped.display_order,
        enabled: existingProfileTyped.enabled,
        settings: existingProfileTyped.settings,
      },
      afterState: {
        username: profileTyped.username,
        display_name: profileTyped.display_name,
        display_order: profileTyped.display_order,
        enabled: profileTyped.enabled,
        settings: profileTyped.settings,
      },
    });

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Error updating X.com profile:', error);
    res.status(500).json({
      error: 'Failed to update X.com profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/xcom-profiles/reorder
 * Batch update display_order for profiles
 * Body: { organization_id, profileIds: string[] }
 */
router.patch('/reorder', async (req: Request, res: Response) => {
  try {
    const { organization_id, profileIds } = req.body;

    if (!organization_id || !Array.isArray(profileIds)) {
      return res.status(400).json({ 
        error: 'organization_id and profileIds array are required' 
      });
    }

    // Update display_order for each profile
    // @ts-ignore - Supabase type inference issue with new xcom_profiles table
    const updates = profileIds.map((profileId: string, index: number) => 
      supabase
        .from('xcom_profiles')
        // @ts-ignore - Supabase type inference issue with new xcom_profiles table
        .update({ display_order: index } as any)
        .eq('id', profileId)
        .eq('organization_id', organization_id)
    );

    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      console.error('Error reordering profiles:', errors);
      return res.status(500).json({
        error: 'Failed to reorder profiles',
        message: errors[0].error?.message || 'Unknown error',
      });
    }

    // Log audit action for reorder
    const userId = getUserId(req);
    await auditService.logAction({
      action: 'xcom_profile_updated',
      entityType: 'xcom_profile',
      entityId: profileIds[0] || '', // Use first profile ID for batch operation
      userId,
      metadata: {
        operation: 'reorder',
        profile_ids: profileIds,
        organization_id,
      },
    });

    res.json({
      success: true,
      message: 'Profiles reordered successfully',
    });
  } catch (error) {
    console.error('Error reordering profiles:', error);
    res.status(500).json({
      error: 'Failed to reorder profiles',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/xcom-profiles/:id
 * Delete a profile
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get existing profile for audit trail
    const { data: existingProfile, error: fetchError } = await supabase
      .from('xcom_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingProfile) {
      return res.status(404).json({ error: 'X.com profile not found' });
    }

    // @ts-ignore - Supabase type inference issue with new xcom_profiles table
    const { error } = await supabase
      .from('xcom_profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Log audit action
    const userId = getUserId(req);
    const existingProfileTyped = existingProfile as any;
    await auditService.logAction({
      action: 'xcom_profile_deleted',
      entityType: 'xcom_profile',
      entityId: id,
      userId,
      beforeState: {
        organization_id: existingProfileTyped.organization_id,
        username: existingProfileTyped.username,
        display_name: existingProfileTyped.display_name,
        enabled: existingProfileTyped.enabled,
      },
    });

    res.json({
      success: true,
      message: 'X.com profile deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting X.com profile:', error);
    res.status(500).json({
      error: 'Failed to delete X.com profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
