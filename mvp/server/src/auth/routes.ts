import type { Request, RequestHandler, Router } from 'express';
import { Router as createRouter } from 'express';
import type { Accounts, SignedIn } from './accounts.js';
import { verifyMvpPassword } from './password.js';

/**
 * Sign-in (NEWS-254).
 *
 * - `{ email, password }` signs in a user account. It needs the database
 *   (accounts on); without it the answer is 503.
 * - `{ password }` alone is checked against MVP_PASSWORD / MVP_PASSWORD_HASH,
 *   as before, so Kite's Topics form keeps working until the new sign-in
 *   screen ships. When OPERATOR_EMAIL names an account, it signs in as that
 *   account; a missing or disabled operator account is refused. Without
 *   OPERATOR_EMAIL, or when the database cannot be reached, the session has
 *   no user, as before.
 */

const INVALID_ACCOUNT = 'Invalid email or password';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function startSession(req: Request, signedIn: SignedIn | null): boolean {
  if (!req.session) return false;
  req.session.authenticated = true;
  if (signedIn) {
    req.session.userId = signedIn.user.id;
    req.session.stamp = signedIn.stamp;
  } else {
    delete req.session.userId;
    delete req.session.stamp;
  }
  return true;
}

export function createAuthRouter(accounts?: Accounts): Router {
  const router = createRouter();

  router.post('/login', async (req, res) => {
    const password = text(req.body?.password);
    const hasEmail = req.body?.email !== undefined;
    const email = text(req.body?.email).trim();

    if (hasEmail) {
      if (!email || !password) {
        res.status(400).json({ ok: false, error: 'Email and password are required' });
        return;
      }
      if (!accounts) {
        res.status(503).json({ ok: false, error: 'Accounts are not set up' });
        return;
      }
      let signedIn: SignedIn | null;
      try {
        signedIn = await accounts.signIn(email, password);
      } catch (err) {
        console.error('Account sign-in failed:', errorMessage(err));
        res.status(503).json({ ok: false, error: 'Accounts are unavailable' });
        return;
      }
      if (!signedIn) {
        res.status(401).json({ ok: false, error: INVALID_ACCOUNT });
        return;
      }
      if (!startSession(req, signedIn)) {
        res.status(500).json({ ok: false, error: 'Session unavailable' });
        return;
      }
      res.json({ ok: true, user: signedIn.user });
      return;
    }

    try {
      if (!password) {
        res.status(400).json({ ok: false, error: 'Password is required' });
        return;
      }

      const valid = await verifyMvpPassword(password);
      if (!valid) {
        res.status(401).json({ ok: false, error: 'Invalid password' });
        return;
      }

      let signedIn: SignedIn | null = null;
      if (accounts?.hasOperator) {
        let lookupFailed = false;
        try {
          signedIn = await accounts.operator();
        } catch (err) {
          // The MVP password still proves the operator. Sign in without a
          // user rather than lock the operator out while the database is down.
          console.error('Operator account lookup failed:', errorMessage(err));
          lookupFailed = true;
        }
        if (!signedIn && !lookupFailed) {
          res.status(401).json({ ok: false, error: 'Operator account is missing or disabled' });
          return;
        }
      }

      if (!startSession(req, signedIn)) {
        res.status(500).json({ ok: false, error: 'Session unavailable' });
        return;
      }
      // With no account the answer stays `{ ok: true }`, as before.
      res.json(signedIn ? { ok: true, user: signedIn.user } : { ok: true });
    } catch (err) {
      const message = errorMessage(err);
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

  /** Who is signed in. `user` is null for a session with no account. */
  router.get('/me', async (req, res) => {
    const userId = text(req.session?.userId);
    if (!userId || !accounts) {
      res.json({ ok: true, user: null });
      return;
    }
    try {
      res.json({ ok: true, user: await accounts.activeUser(userId, text(req.session?.stamp)) });
    } catch (err) {
      console.error('Account lookup failed:', errorMessage(err));
      res.status(503).json({ ok: false, error: 'Accounts are unavailable' });
    }
  });

  return router;
}

/**
 * Protect every /api/* path except login and logout. A session that names a
 * user is checked against the database on each request: a disabled or deleted
 * account, or one whose password changed since this sign-in, is signed out
 * (401). When the database cannot be reached, the signed
 * cookie is trusted for that request.
 */
export function requireApiSession(accounts?: Accounts): RequestHandler {
  return (req, res, next) => {
    if (req.path === '/login' || req.path === '/logout') {
      next();
      return;
    }
    if (req.session?.authenticated !== true) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    const userId = text(req.session.userId);
    if (!userId || !accounts) {
      next();
      return;
    }
    accounts.activeUser(userId, text(req.session.stamp)).then(
      (user) => {
        if (user) {
          next();
          return;
        }
        req.session = null;
        res.status(401).json({ ok: false, error: 'Unauthorized' });
      },
      (err: unknown) => {
        console.error('Account check failed; trusting the session:', errorMessage(err));
        next();
      },
    );
  };
}
