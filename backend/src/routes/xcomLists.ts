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
 * GET /api/xcom-lists
 * Get all lists for an organization (ordered by display_order)
 * Query params: organization_id (required)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    // @ts-ignore - Supabase type inference issue with new xcom_lists table
    const { data: lists, error } = await supabase
      .from('xcom_lists')
      .select('*')
      .eq('organization_id', organization_id as string)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      lists: lists || [],
    });
  } catch (error) {
    console.error('Error fetching X.com lists:', error);
    res.status(500).json({
      error: 'Failed to fetch X.com lists',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/xcom-lists/:id
 * Get a single list by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // @ts-ignore - Supabase type inference issue with new xcom_lists table
    const { data: list, error } = await supabase
      .from('xcom_lists')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'X.com list not found' });
      }
      throw error;
    }

    if (!list) {
      return res.status(404).json({ error: 'X.com list not found' });
    }

    res.json({
      success: true,
      list,
    });
  } catch (error) {
    console.error('Error fetching X.com list:', error);
    res.status(500).json({
      error: 'Failed to fetch X.com list',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/xcom-lists
 * Create a new list
 * Body: { organization_id, owner_screen_name, slug, display_name?, display_order?, settings?, enabled? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, owner_screen_name, slug, display_name, display_order, settings, enabled } = req.body;

    if (!organization_id || !owner_screen_name || !slug) {
      return res.status(400).json({ 
        error: 'organization_id, owner_screen_name, and slug are required' 
      });
    }

    // Strip @ from owner_screen_name if present
    const cleanOwnerScreenName = owner_screen_name.replace(/^@/, '');

    // Validate owner_screen_name format
    if (!/^[a-zA-Z0-9_]+$/.test(cleanOwnerScreenName)) {
      return res.status(400).json({ 
        error: 'Owner screen name must contain only letters, numbers, and underscores' 
      });
    }

    // Validate slug format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return res.status(400).json({ 
        error: 'Slug must contain only letters, numbers, hyphens, and underscores' 
      });
    }

    // @ts-ignore - Supabase type inference issue with new xcom_lists table
    const { data: list, error } = await supabase
      .from('xcom_lists')
      .insert({
        organization_id,
        owner_screen_name: cleanOwnerScreenName,
        slug,
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
          error: 'A list with this owner and slug already exists for this organization' 
        });
      }
      throw error;
    }

    // Log audit action
    const userId = getUserId(req);
    const listTyped = list as any;
    await auditService.logAction({
      action: 'xcom_list_created',
      entityType: 'xcom_list',
      entityId: listTyped.id,
      userId,
      afterState: {
        organization_id: listTyped.organization_id,
        owner_screen_name: listTyped.owner_screen_name,
        slug: listTyped.slug,
        display_name: listTyped.display_name,
        enabled: listTyped.enabled,
      },
    });

    res.status(201).json({
      success: true,
      list,
    });
  } catch (error) {
    console.error('Error creating X.com list:', error);
    res.status(500).json({
      error: 'Failed to create X.com list',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/xcom-lists/:id
 * Update a list
 * Body: { owner_screen_name?, slug?, display_name?, display_order?, settings?, enabled? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { owner_screen_name, slug, display_name, display_order, settings, enabled } = req.body;

    // Get existing list for audit trail
    const { data: existingList, error: fetchError } = await supabase
      .from('xcom_lists')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingList) {
      return res.status(404).json({ error: 'X.com list not found' });
    }

    // Prepare update object
    const updates: any = {};
    if (owner_screen_name !== undefined) {
      // Strip @ from owner_screen_name if present
      const cleanOwnerScreenName = owner_screen_name.replace(/^@/, '');
      if (!/^[a-zA-Z0-9_]+$/.test(cleanOwnerScreenName)) {
        return res.status(400).json({ 
          error: 'Owner screen name must contain only letters, numbers, and underscores' 
        });
      }
      updates.owner_screen_name = cleanOwnerScreenName;
    }
    if (slug !== undefined) {
      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return res.status(400).json({ 
          error: 'Slug must contain only letters, numbers, hyphens, and underscores' 
        });
      }
      updates.slug = slug;
    }
    if (display_name !== undefined) updates.display_name = display_name;
    if (display_order !== undefined) updates.display_order = display_order;
    if (settings !== undefined) updates.settings = settings;
    if (enabled !== undefined) updates.enabled = enabled;

    // @ts-ignore - Supabase type inference issue with new xcom_lists table
    const { data: list, error } = await supabase
      .from('xcom_lists')
      // @ts-ignore - Supabase type inference issue with new xcom_lists table
      .update(updates as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // Handle duplicate key error
      if (error.code === '23505') {
        return res.status(409).json({ 
          error: 'A list with this owner and slug already exists for this organization' 
        });
      }
      throw error;
    }

    // Log audit action
    const userId = getUserId(req);
    const existingListTyped = existingList as any;
    const listTyped = list as any;
    await auditService.logAction({
      action: 'xcom_list_updated',
      entityType: 'xcom_list',
      entityId: id,
      userId,
      beforeState: {
        owner_screen_name: existingListTyped.owner_screen_name,
        slug: existingListTyped.slug,
        display_name: existingListTyped.display_name,
        display_order: existingListTyped.display_order,
        enabled: existingListTyped.enabled,
        settings: existingListTyped.settings,
      },
      afterState: {
        owner_screen_name: listTyped.owner_screen_name,
        slug: listTyped.slug,
        display_name: listTyped.display_name,
        display_order: listTyped.display_order,
        enabled: listTyped.enabled,
        settings: listTyped.settings,
      },
    });

    res.json({
      success: true,
      list,
    });
  } catch (error) {
    console.error('Error updating X.com list:', error);
    res.status(500).json({
      error: 'Failed to update X.com list',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/xcom-lists/reorder
 * Batch update display_order for lists
 * Body: { organization_id, listIds: string[] }
 */
router.patch('/reorder', async (req: Request, res: Response) => {
  try {
    const { organization_id, listIds } = req.body;

    if (!organization_id || !Array.isArray(listIds)) {
      return res.status(400).json({ 
        error: 'organization_id and listIds array are required' 
      });
    }

    // Update display_order for each list
    // @ts-ignore - Supabase type inference issue with new xcom_lists table
    const updates = listIds.map((listId: string, index: number) => 
      supabase
        .from('xcom_lists')
        // @ts-ignore - Supabase type inference issue with new xcom_lists table
        .update({ display_order: index } as any)
        .eq('id', listId)
        .eq('organization_id', organization_id)
    );

    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      console.error('Error reordering lists:', errors);
      return res.status(500).json({
        error: 'Failed to reorder lists',
        message: errors[0].error?.message || 'Unknown error',
      });
    }

    // Log audit action for reorder
    const userId = getUserId(req);
    await auditService.logAction({
      action: 'xcom_list_updated',
      entityType: 'xcom_list',
      entityId: listIds[0] || '', // Use first list ID for batch operation
      userId,
      metadata: {
        operation: 'reorder',
        list_ids: listIds,
        organization_id,
      },
    });

    res.json({
      success: true,
      message: 'Lists reordered successfully',
    });
  } catch (error) {
    console.error('Error reordering lists:', error);
    res.status(500).json({
      error: 'Failed to reorder lists',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/xcom-lists/:id
 * Delete a list
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get existing list for audit trail
    const { data: existingList, error: fetchError } = await supabase
      .from('xcom_lists')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingList) {
      return res.status(404).json({ error: 'X.com list not found' });
    }

    // @ts-ignore - Supabase type inference issue with new xcom_lists table
    const { error } = await supabase
      .from('xcom_lists')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Log audit action
    const userId = getUserId(req);
    const existingListTyped = existingList as any;
    await auditService.logAction({
      action: 'xcom_list_deleted',
      entityType: 'xcom_list',
      entityId: id,
      userId,
      beforeState: {
        organization_id: existingListTyped.organization_id,
        owner_screen_name: existingListTyped.owner_screen_name,
        slug: existingListTyped.slug,
        display_name: existingListTyped.display_name,
        enabled: existingListTyped.enabled,
      },
    });

    res.json({
      success: true,
      message: 'X.com list deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting X.com list:', error);
    res.status(500).json({
      error: 'Failed to delete X.com list',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
