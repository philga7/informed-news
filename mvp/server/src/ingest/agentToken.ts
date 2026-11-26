import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Agent tokens (NEWS-263). The operator command makes every token: a fixed
 * prefix, so a leaked one is easy to recognise, and 32 random bytes. The
 * site stores only the token's SHA-256 hash. A token is long and random, so a
 * fast hash is enough; a slow password hash would only slow every post.
 */
export const AGENT_TOKEN_PREFIX = 'inag_';
const TOKEN_SHAPE = /^inag_[A-Za-z0-9_-]{43}$/;

export function generateAgentToken(): string {
  return `${AGENT_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** True when the value has a token's shape. Anything else is refused without a lookup. */
export function looksLikeAgentToken(value: string): boolean {
  return TOKEN_SHAPE.test(value);
}

/** The stored form of a token: its SHA-256 hash, lowercase hex. */
export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Compares two stored hashes in constant time. */
export function sameTokenHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
}
