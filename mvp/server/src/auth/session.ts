import cookieSession from 'cookie-session';
import type { RequestHandler } from 'express';

export function createSessionMiddleware(): RequestHandler {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'Auth misconfigured: set SESSION_SECRET in the environment',
    );
  }

  return cookieSession({
    name: 'mvp_session',
    keys: [secret],
    httpOnly: true,
    sameSite: 'lax',
    // Secure only when served over HTTPS; local MVP uses http.
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export const requireSession: RequestHandler = (req, res, next) => {
  if (req.session?.authenticated === true) {
    next();
    return;
  }
  res.status(401).json({ ok: false, error: 'Unauthorized' });
};
