import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import type { IngestConfig } from '../ingest/openIngest.js';
import { readDashboard, type DashboardViewer } from '../store/postgres/dashboardRead.js';
import { readStory, type StoryRecord } from '../store/postgres/dashboardStore.js';
import { clearFollowState, setFollowState } from '../store/postgres/followStore.js';
import { pgErrorCode } from '../store/postgres/storeSupport.js';

/**
 * Dashboard routes (NEWS-225). Mounted on /api after the session guard.
 * GET /api/dashboard reads the home shell.
 * PUT and DELETE /api/stories/:id/follow-state set or clear follow and hide.
 * A missing database, a rejected ready(), or a failed query is 503 with no
 * SQL in the body.
 */

const UNAVAILABLE = { ok: false, error: 'data unavailable' } as const;
const NEEDS_ACCOUNT = { ok: false, error: 'needs an account' } as const;
const STORY_NOT_FOUND = { ok: false, error: 'Story not found' } as const;
const BAD_STATE = { ok: false, error: 'state must be follow or hide' } as const;

type FollowWrite = 'set' | 'clear';

type CheckedUser = { user: { email: string } | null } | undefined;

function viewerFrom(req: Request, res: Response, operatorEmail: string | undefined): DashboardViewer {
  const rawId = req.session?.userId;
  const userId = typeof rawId === 'string' && rawId.trim() !== '' ? rawId : null;
  const checked = res.locals.checkedUser as CheckedUser;
  const email = typeof checked?.user?.email === 'string' ? checked.user.email.trim() : '';
  const operator = operatorEmail?.trim().toLowerCase() ?? '';
  const admin = userId !== null && email !== '' && operator !== '' && email.toLowerCase() === operator;
  return { userId, admin };
}

function storyIdOf(req: Request): string {
  const { id } = req.params;
  return typeof id === 'string' ? id : '';
}

/** `"follow"` or `"hide"`. Anything else, including a missing state, is refused. */
function requestedState(body: unknown): 'follow' | 'hide' | null {
  if (typeof body !== 'object' || body === null) return null;
  const state = (body as { state?: unknown }).state;
  if (state === 'follow' || state === 'hide') return state;
  return null;
}

/**
 * A story this route may address is shared, owned by the session user, or
 * any story when the viewer is admin. A hide does not take it out of reach.
 */
function mayAddressStory(ownerUserId: string | null, viewer: DashboardViewer): boolean {
  if (viewer.admin) return true;
  if (ownerUserId === null) return true;
  return ownerUserId === viewer.userId;
}

async function storyForViewer(pool: Pool, id: string, viewer: DashboardViewer): Promise<StoryRecord | null> {
  const story = await readStory(pool, id);
  if (!story || !mayAddressStory(story.ownerUserId, viewer)) return null;
  return story;
}

export function createDashboardRouter(deps: {
  ingest?: IngestConfig;
  operatorEmail?: string;
}): Router {
  const router = Router();

  router.get('/dashboard', (req, res) => {
    void respond(req, res);
  });

  async function respond(req: Request, res: Response): Promise<void> {
    const config = deps.ingest;
    if (!config?.pool) {
      res.status(503).json(UNAVAILABLE);
      return;
    }
    try {
      await config.ready();
      const body = await readDashboard(config.pool, viewerFrom(req, res, deps.operatorEmail));
      if (!res.headersSent) res.json({ ok: true, ...body });
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : typeof error;
      console.error(`Dashboard read failed (${name}, ${pgErrorCode(error) ?? 'no code'})`);
      if (!res.headersSent) res.status(503).json(UNAVAILABLE);
    }
  }

  router.put('/stories/:id/follow-state', (req, res) => {
    void writeFollow(req, res, 'set');
  });

  router.delete('/stories/:id/follow-state', (req, res) => {
    void writeFollow(req, res, 'clear');
  });

  async function writeFollow(req: Request, res: Response, mode: FollowWrite): Promise<void> {
    const config = deps.ingest;
    if (!config?.pool) {
      res.status(503).json(UNAVAILABLE);
      return;
    }
    try {
      await config.ready();
      const viewer = viewerFrom(req, res, deps.operatorEmail);
      const userId = viewer.userId;
      if (userId === null) {
        res.status(403).json(NEEDS_ACCOUNT);
        return;
      }
      const story = await storyForViewer(config.pool, storyIdOf(req), viewer);
      if (!story) {
        res.status(404).json(STORY_NOT_FOUND);
        return;
      }
      switch (mode) {
        case 'set': {
          const state = requestedState(req.body);
          if (state === null) {
            res.status(400).json(BAD_STATE);
            return;
          }
          const record = await setFollowState(config.pool, userId, { kind: 'story', storyId: story.id }, state);
          if (!res.headersSent) res.json({ ok: true, state: record.state, updatedAt: record.updatedAt });
          return;
        }
        case 'clear': {
          await clearFollowState(config.pool, userId, { kind: 'story', storyId: story.id });
          if (!res.headersSent) res.status(204).end();
          return;
        }
        default: {
          const unexpected: never = mode;
          throw new Error(`unexpected follow mode ${String(unexpected)}`);
        }
      }
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : typeof error;
      console.error(`Follow state failed (${name}, ${pgErrorCode(error) ?? 'no code'})`);
      if (!res.headersSent) res.status(503).json(UNAVAILABLE);
    }
  }

  return router;
}
