import { randomBytes } from 'node:crypto';
import { randomSecret, sha256Hex } from './hashing';

/**
 * API key format: `pmk_<prefix>_<secret>`
 * - prefix: 8 hex chars (4 random bytes). Hex has no `_`, so splitting is unambiguous.
 * - secret: 32 random bytes as base64url (43 chars).
 * Only `pmk_<prefix>` (to recognize a key) and sha256(full key) are stored.
 */
export const API_KEY_PATTERN = /^pmk_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;

export interface ParsedApiKey {
  /** What is stored in api_keys.key_prefix, e.g. `pmk_1a2b3c4d`. */
  keyPrefix: string;
  /** What is stored in api_keys.key_hash. */
  keyHash: string;
}

export interface GeneratedApiKey extends ParsedApiKey {
  /** The full key. Show it once; it is never stored. */
  key: string;
}

export function generateApiKey(): GeneratedApiKey {
  const key = `pmk_${randomBytes(4).toString('hex')}_${randomSecret()}`;
  // A freshly generated key always matches the pattern.
  return { key, ...(parseApiKey(key) as ParsedApiKey) };
}

/**
 * Validates the format and returns the stored representation, or null when the
 * value is not an API key. Checking the format first means garbage never
 * reaches the database.
 */
export function parseApiKey(key: string): ParsedApiKey | null {
  const match = API_KEY_PATTERN.exec(key);
  if (match === null) {
    return null;
  }
  return { keyPrefix: `pmk_${match[1]}`, keyHash: sha256Hex(key) };
}
