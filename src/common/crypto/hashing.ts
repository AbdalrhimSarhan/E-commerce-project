import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Bytes of randomness for refresh token secrets and API key secrets (256 bits). */
export const SECRET_BYTES = 32;

/**
 * sha256 as 64 hex chars. Used for refresh tokens and API keys: they are long
 * random values, so a fast hash is safe (unlike passwords, which use bcrypt).
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** A random secret encoded as base64url (43 chars for 32 bytes, URL- and header-safe). */
export function randomSecret(bytes: number = SECRET_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Compares two hex hashes in constant time, so response timing does not
 * reveal how many leading characters matched.
 */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
