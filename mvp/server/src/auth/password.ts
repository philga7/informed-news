import bcrypt from 'bcryptjs';

/**
 * Verify a candidate password against MVP_PASSWORD (plaintext) or
 * MVP_PASSWORD_HASH (bcrypt). Prefer hash when both are set.
 */
export async function verifyMvpPassword(candidate: string): Promise<boolean> {
  const hash = process.env.MVP_PASSWORD_HASH?.trim();
  if (hash) {
    return bcrypt.compare(candidate, hash);
  }

  const plaintext = process.env.MVP_PASSWORD;
  if (plaintext === undefined || plaintext === '') {
    throw new Error(
      'Auth misconfigured: set MVP_PASSWORD or MVP_PASSWORD_HASH in the environment',
    );
  }

  return candidate === plaintext;
}
