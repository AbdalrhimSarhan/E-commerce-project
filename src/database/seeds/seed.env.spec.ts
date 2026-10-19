import { validateSeedEnv } from './seed.env';

const DEV_KEY = 'pmk_00000000_DEV-ONLY_local-agent-key_CHANGE-ME-outside0';

const validSeedEnv = {
  SEED_SUPER_ADMIN_EMAIL: 'superadmin@example.com',
  SEED_SUPER_ADMIN_PASSWORD: 'SuperAdmin123',
  SEED_ADMIN_EMAIL: 'admin@example.com',
  SEED_ADMIN_PASSWORD: 'Admin12345',
  SEED_USER_EMAIL: 'user@example.com',
  SEED_USER_PASSWORD: 'User12345',
  SEED_AGENT_EMAIL: 'agent@example.com',
};

describe('validateSeedEnv', () => {
  it('accepts a valid configuration without an agent key', () => {
    const env = validateSeedEnv(validSeedEnv);

    expect(env.SEED_ADMIN_EMAIL).toBe('admin@example.com');
    expect(env.SEED_AGENT_API_KEY).toBeUndefined();
  });

  it('normalizes emails (trim + lowercase)', () => {
    const env = validateSeedEnv({
      ...validSeedEnv,
      SEED_ADMIN_EMAIL: '  Admin@Example.COM ',
    });

    expect(env.SEED_ADMIN_EMAIL).toBe('admin@example.com');
  });

  it('accepts a well-formed SEED_AGENT_API_KEY', () => {
    expect(
      validateSeedEnv({ ...validSeedEnv, SEED_AGENT_API_KEY: DEV_KEY })
        .SEED_AGENT_API_KEY,
    ).toBe(DEV_KEY);
  });

  it('treats an empty SEED_AGENT_API_KEY as not set', () => {
    expect(
      validateSeedEnv({ ...validSeedEnv, SEED_AGENT_API_KEY: '' })
        .SEED_AGENT_API_KEY,
    ).toBeUndefined();
  });

  it('rejects a malformed SEED_AGENT_API_KEY', () => {
    expect(() =>
      validateSeedEnv({ ...validSeedEnv, SEED_AGENT_API_KEY: 'pmk_123' }),
    ).toThrow(/SEED_AGENT_API_KEY/);
  });

  it.each([
    ['too short', 'abc1234'],
    ['no digit', 'onlyletters'],
    ['no letter', '1234567890'],
    ['longer than 72', `a1${'x'.repeat(71)}`],
  ])('rejects a password that is %s', (_label, password) => {
    expect(() =>
      validateSeedEnv({ ...validSeedEnv, SEED_USER_PASSWORD: password }),
    ).toThrow(/SEED_USER_PASSWORD/);
  });

  it('rejects missing variables and invalid emails, listing each', () => {
    expect(() =>
      validateSeedEnv({
        ...validSeedEnv,
        SEED_SUPER_ADMIN_PASSWORD: undefined,
        SEED_AGENT_EMAIL: 'not-an-email',
      }),
    ).toThrow(/SEED_SUPER_ADMIN_PASSWORD[\s\S]*SEED_AGENT_EMAIL/);
  });

  it('rejects duplicate emails, also after normalization', () => {
    expect(() =>
      validateSeedEnv({
        ...validSeedEnv,
        SEED_USER_EMAIL: 'ADMIN@example.com',
      }),
    ).toThrow(/must be different/);
  });
});
