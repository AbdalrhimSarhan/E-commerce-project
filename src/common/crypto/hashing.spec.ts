import { hashesEqual, randomSecret, sha256Hex } from './hashing';

describe('sha256Hex', () => {
  it('returns the known sha256 digest as 64 hex chars', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('randomSecret', () => {
  it('returns 43 base64url chars for 32 bytes, different every time', () => {
    const first = randomSecret();
    const second = randomSecret();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });
});

describe('hashesEqual', () => {
  const hash = sha256Hex('secret');

  it('is true for the same hash', () => {
    expect(hashesEqual(hash, sha256Hex('secret'))).toBe(true);
  });

  it('is false for a different hash', () => {
    expect(hashesEqual(hash, sha256Hex('other'))).toBe(false);
  });

  it('is false (and does not throw) for different lengths', () => {
    expect(hashesEqual(hash, 'abcd')).toBe(false);
  });
});
