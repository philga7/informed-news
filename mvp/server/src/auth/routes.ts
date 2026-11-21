import type { Request, RequestHandler, Router } from 'express';
import { Router as createRouter } from 'express';
import type { Accounts, SessionUser, SignedIn } from './accounts.js';
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

/**
 * `operatorPending` marks a password-only session made while the operator
 * account could not be looked up. The guard looks it up again on later
 * requests and turns the session into the operator's, or signs it out.
 */
function startSession(
  req: Request,
  signedIn: SignedIn | null,
  operatorPending = false,
): boolean {
  if (!req.session) return false;
  req.session.authenticated = true;
  if (signedIn) {
    req.session.userId = signedIn.user.id;
    req.session.stamp = signedIn.stamp;
  } else {
    delete req.session.userId;
    delete req.session.stamp;
  }
  if (operatorPending) req.session.operatorPending = true;
  else delete req.session.operatorPending;
  return true;
}

/** The account the guard resolved for this request; undefined when unchecked. */
type CheckedUser = { user: SessionUser | null } | undefined;

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
      let lookupFailedForOperator = false;
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
        lookupFailedForOperator = lookupFailed;
        if (!signedIn && !lookupFailed) {
          res.status(401).json({ ok: false, error: 'Operator account is missing or disabled' });
          return;
        }
      }

      if (!startSession(req, signedIn, lookupFailedForOperator)) {
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

  /**
   * Who is signed in. `user` is null for a session with no account. The guard
   * has already checked the account; when it could not (database down), 503.
   */
  router.get('/me', (req, res) => {
    const checked = res.locals.checkedUser as CheckedUser;
    if (!text(req.session?.userId)) {
      res.json({ ok: true, user: null });
      return;
    }
    if (checked === undefined) {
      res.status(503).json({ ok: false, error: 'Accounts are unavailable' });
      return;
    }
    res.json({ ok: true, user: checked.user });
  });

  return router;
}

/**
 * Protect every /api/* path except login and logout. A session that names a
 * user is checked against the database on each request: a disabled or deleted
 * account, or one whose password changed since this sign-in, is signed out
 * (401). A password-only session made while the operator lookup failed is
 * looked up again: it becomes the operator's session, or is signed out when
 * that account is missing or disabled. When the database cannot be reached,
 * the signed cookie is trusted for that request.
 */
export function requireApiSession(accounts?: Accounts): RequestHandler {
  return (req, res, next) => {
    if (req.path === '/login' || req.path === '/logout') {
      next();
      return;
    }
    const session = req.session;
    if (session?.authenticated !== true) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }
    const signOut = () => {
      req.session = null;
      res.status(401).json({ ok: false, error: 'Unauthorized' });
    };
    const trust = (err: unknown) => {
      console.error('Account check failed; trusting the session:', errorMessage(err));
      next();
    };

    if (accounts && session.operatorPending === true && !text(session.userId)) {
      // Made while the operator lookup failed: look again now.
      accounts.operator().then((signedIn) => {
        if (!signedIn) {
          signOut();
          return;
        }
        startSession(req, signedIn);
        res.locals.checkedUser = { user: signedIn.user } satisfies CheckedUser;
        next();
      }, trust);
      return;
    }

    const userId = text(session.userId);
    if (!userId || !accounts) {
      next();
      return;
    }
    accounts.activeUser(userId, text(session.stamp)).then((user) => {
      if (!user) {
        signOut();
        return;
      }
      res.locals.checkedUser = { user } satisfies CheckedUser;
      next();
    }, trust);
  };
}
