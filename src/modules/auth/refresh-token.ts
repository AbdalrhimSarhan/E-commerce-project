import { randomSecret, sha256Hex } from '../../common/crypto/hashing';

/**
 * Refresh token format: `<sessionId>.<secret>` (opaque, not a JWT).
 * - sessionId: the sessions.id uuid, used to find the session.
 * - secret: 32 random bytes as base64url. Only sha256(secret) is stored.
 */
const REFRESH_TOKEN_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

export interface IssuedRefreshToken {
  /** Give this to the client; it is never stored. */
  token: string;
  /** Store this in sessions.refresh_token_hash. */
  secretHash: string;
}

export interface ParsedRefreshToken {
  sessionId: string;
  secretHash: string;
}

export function issueRefreshToken(sessionId: string): IssuedRefreshToken {
  const secret = randomSecret();
  return { token: `${sessionId}.${secret}`, secretHash: sha256Hex(secret) };
}

/** Returns null for anything that is not a well-formed refresh token. */
export function parseRefreshToken(token: string): ParsedRefreshToken | null {
  const match = REFRESH_TOKEN_PATTERN.exec(token);
  if (match === null) {
    return null;
  }
  return { sessionId: match[1], secretHash: sha256Hex(match[2]) };
}
