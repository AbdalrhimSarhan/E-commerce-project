import { API_KEY_PATTERN, generateApiKey, parseApiKey } from './api-key';
import { sha256Hex } from './hashing';

describe('generateApiKey', () => {
  it('produces pmk_<8 hex>_<43 base64url> with matching prefix and hash', () => {
    const { key, keyPrefix, keyHash } = generateApiKey();

    expect(key).toMatch(API_KEY_PATTERN);
    expect(key.startsWith(`${keyPrefix}_`)).toBe(true);
    expect(keyPrefix).toMatch(/^pmk_[0-9a-f]{8}$/);
    expect(keyPrefix.length).toBeLessThanOrEqual(16); // api_keys.key_prefix is varchar(16)
    expect(keyHash).toBe(sha256Hex(key));
  });

  it('never repeats a key', () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => generateApiKey().key),
    );

    expect(keys.size).toBe(50);
  });
});

describe('parseApiKey', () => {
  const valid = `pmk_0a1b2c3d_${'A'.repeat(40)}-_9`;

  it('returns the prefix and the hash of the full key', () => {
    expect(parseApiKey(valid)).toEqual({
      keyPrefix: 'pmk_0a1b2c3d',
      keyHash: sha256Hex(valid),
    });
  });

  it.each([
    ['empty', ''],
    ['garbage', 'not-a-key'],
    ['wrong scheme', `abc_0a1b2c3d_${'A'.repeat(43)}`],
    ['uppercase hex prefix', `pmk_0A1B2C3D_${'A'.repeat(43)}`],
    ['short prefix', `pmk_0a1b2c_${'A'.repeat(43)}`],
    ['short secret', `pmk_0a1b2c3d_${'A'.repeat(42)}`],
    ['long secret', `pmk_0a1b2c3d_${'A'.repeat(44)}`],
    ['invalid secret char', `pmk_0a1b2c3d_${'A'.repeat(42)}=`],
    ['surrounding whitespace', ` pmk_0a1b2c3d_${'A'.repeat(43)}`],
  ])('returns null for %s', (_label, value) => {
    expect(parseApiKey(value)).toBeNull();
  });
});
