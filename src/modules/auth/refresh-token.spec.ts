import { randomUUID } from 'node:crypto';
import { sha256Hex } from '../../common/crypto/hashing';
import { issueRefreshToken, parseRefreshToken } from './refresh-token';

describe('refresh tokens', () => {
  it('issues <sessionId>.<secret> and stores only the hash of the secret', () => {
    const sessionId = randomUUID();
    const { token, secretHash } = issueRefreshToken(sessionId);

    const [idPart, secret] = token.split('.');
    expect(idPart).toBe(sessionId);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secretHash).toBe(sha256Hex(secret));
    expect(secretHash).not.toContain(secret);
  });

  it('parses what it issues', () => {
    const sessionId = randomUUID();
    const { token, secretHash } = issueRefreshToken(sessionId);

    expect(parseRefreshToken(token)).toEqual({ sessionId, secretHash });
  });

  it('issues a different secret every time', () => {
    const sessionId = randomUUID();

    expect(issueRefreshToken(sessionId).token).not.toBe(
      issueRefreshToken(sessionId).token,
    );
  });

  it.each([
    ['empty', ''],
    ['no dot', 'abc'],
    ['not a uuid', `not-a-uuid.${'A'.repeat(43)}`],
    ['short secret', `${randomUUID()}.${'A'.repeat(42)}`],
    ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'],
    ['extra part', `${randomUUID()}.${'A'.repeat(43)}.x`],
  ])('rejects %s', (_label, token) => {
    expect(parseRefreshToken(token)).toBeNull();
  });
});
