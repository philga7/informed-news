import cookieSession from 'cookie-session';
import type { RequestHandler } from 'express';

import { sessionCookieShouldBeSecure } from './sessionCookie.js';

const SESSION_COOKIE_NAME = 'mvp_session';

export function createSessionMiddleware(): RequestHandler {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'Auth misconfigured: set SESSION_SECRET in the environment',
    );
  }

  const sessionMiddleware = cookieSession({
    name: SESSION_COOKIE_NAME,
    keys: [secret],
    httpOnly: true,
    sameSite: 'lax',
    // cookie-session refuses to set a Secure cookie on a plain-HTTP socket, which
    // is what the proxy-to-container hop is. Secure is appended below instead.
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return (req, res, next) => {
    // Registered before cookie-session's own writeHead hook so it is the inner
    // wrapper: cookie-session sets Set-Cookie first, then this appends Secure.
    const writeHead = res.writeHead;
    res.writeHead = function patchedWriteHead(
      this: typeof res,
      ...args: unknown[]
    ) {
      if (sessionCookieShouldBeSecure(req)) {
        const existing = res.getHeader('Set-Cookie');
        if (existing !== undefined) {
          const list = Array.isArray(existing) ? existing : [String(existing)];
          res.setHeader(
            'Set-Cookie',
            list.map((c) =>
              c.startsWith(`${SESSION_COOKIE_NAME}`) && !/;\s*secure(;|$)/i.test(c)
                ? `${c}; Secure`
                : c,
            ),
          );
        }
      }
      return (writeHead as (...a: unknown[]) => typeof res).apply(this, args);
    } as typeof res.writeHead;
    sessionMiddleware(req, res, next);
  };
}

export const requireSession: RequestHandler = (req, res, next) => {
  if (req.session?.authenticated === true) {
    next();
    return;
  }
  res.status(401).json({ ok: false, error: 'Unauthorized' });
};
