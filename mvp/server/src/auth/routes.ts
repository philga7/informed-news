import type { RequestHandler, Router } from 'express';
import { Router as createRouter } from 'express';
import { verifyMvpPassword } from './password.js';
import { requireSession } from './session.js';

export function createAuthRouter(): Router {
  const router = createRouter();

  router.post('/login', async (req, res) => {
    try {
      const password =
        typeof req.body?.password === 'string' ? req.body.password : '';

      if (!password) {
        res.status(400).json({ ok: false, error: 'Password is required' });
        return;
      }

      const valid = await verifyMvpPassword(password);
      if (!valid) {
        res.status(401).json({ ok: false, error: 'Invalid password' });
        return;
      }

      if (!req.session) {
        res.status(500).json({ ok: false, error: 'Session unavailable' });
        return;
      }

      req.session.authenticated = true;
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Login failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  router.post('/logout', (req, res) => {
    if (req.session) {
      req.session = null;
    }
    res.json({ ok: true });
  });

  return router;
}

/** Protect every /api/* path except login and logout. */
export const requireApiSession: RequestHandler = (req, res, next) => {
  const path = req.path;
  if (path === '/login' || path === '/logout') {
    next();
    return;
  }
  return requireSession(req, res, next);
};
