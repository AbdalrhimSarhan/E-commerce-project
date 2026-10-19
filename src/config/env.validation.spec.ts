import { NodeEnv, parseTrustProxy, validateEnv } from './env.validation';

const validEnv = {
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'secret',
  DB_NAME: 'products',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
};

describe('validateEnv', () => {
  it('applies defaults and converts types', () => {
    const env = validateEnv(validEnv);

    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
    expect(env.DB_PORT).toBe(5433);
    expect(env.DB_LOGGING).toBe(false);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.TRUST_PROXY).toBe('false');
  });

  it('parses numbers, booleans and lists from strings', () => {
    const env = validateEnv({
      ...validEnv,
      PORT: '8080',
      DB_LOGGING: 'true',
      CORS_ORIGINS: 'http://localhost:5173, https://app.example.com,',
    });

    expect(env.PORT).toBe(8080);
    expect(env.DB_LOGGING).toBe(true);
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://app.example.com',
    ]);
  });

  it('fails with a clear message when a required variable is missing', () => {
    const withoutHost: Record<string, unknown> = { ...validEnv };
    delete withoutHost.DB_HOST;

    expect(() => validateEnv(withoutHost)).toThrow(
      /Invalid environment configuration:[\s\S]*DB_HOST/,
    );
  });

  it('lists every invalid variable', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'staging',
        PORT: 'abc',
        DB_LOGGING: 'yes',
      }),
    ).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DB_LOGGING/);
  });

  it('rejects invalid CORS origins and TRUST_PROXY values', () => {
    expect(() =>
      validateEnv({ ...validEnv, CORS_ORIGINS: 'not-a-url' }),
    ).toThrow(/CORS_ORIGINS/);
    expect(() =>
      validateEnv({ ...validEnv, TRUST_PROXY: 'yes please!' }),
    ).toThrow(/TRUST_PROXY/);
  });
});

describe('parseTrustProxy', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['1', 1],
    ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
  ])('parses %p to %p', (input, expected) => {
    expect(parseTrustProxy(input)).toBe(expected);
  });
});
