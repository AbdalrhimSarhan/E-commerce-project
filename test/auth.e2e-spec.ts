import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { IsNull } from 'typeorm';
import { ApiKey } from '../src/modules/auth/entities/api-key.entity';
import { Session } from '../src/modules/auth/entities/session.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import {
  body,
  createApiKey,
  createTestApp,
  createUser,
  login,
  PASSWORD,
  resetDatabase,
  type TestContext,
} from './utils/test-app';

interface TokensData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  tokenType: string;
  user: Record<string, unknown>;
}

interface MeData {
  id: string;
  role: string;
  actorType: string;
  authMethod: string;
  sessionId?: string;
  apiKeyId?: string;
}

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('POST /api/auth/register', () => {
    const valid = {
      email: '  Jane@Example.COM ',
      name: 'Jane',
      password: 'Secret123',
    };

    it('creates a user with role "user" and a normalized email', async () => {
      const res = await request(ctx.http)
        .post('/api/auth/register')
        .send(valid)
        .expect(201);

      expect(body(res).data).toMatchObject({
        email: 'jane@example.com',
        role: 'user',
        isActive: true,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it('rejects a duplicate email (also with different case) with 409', async () => {
      await request(ctx.http)
        .post('/api/auth/register')
        .send(valid)
        .expect(201);

      const res = await request(ctx.http)
        .post('/api/auth/register')
        .send({ ...valid, email: 'JANE@example.com' })
        .expect(409);
      expect(body(res).error?.code).toBe('CONFLICT');
    });

    it('rejects a "role" field with 400', async () => {
      const res = await request(ctx.http)
        .post('/api/auth/register')
        .send({ ...valid, role: 'admin' })
        .expect(400);

      expect(body(res).error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'role', message: 'property role should not exist' }],
      });
    });

    it.each([
      ['too short', 'abc12'],
      ['no digit', 'onlyletters'],
      ['no letter', '12345678'],
    ])('rejects a weak password (%s) with 400', async (_label, password) => {
      const res = await request(ctx.http)
        .post('/api/auth/register')
        .send({ ...valid, password })
        .expect(400);
      expect(body(res).error?.details?.[0].field).toBe('password');
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a token pair and the user without password hash', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);

      const res = await request(ctx.http)
        .post('/api/auth/login')
        .set('User-Agent', 'e2e-test-agent')
        .send({ email: user.email.toUpperCase(), password: PASSWORD })
        .expect(200);

      const data = body<TokensData>(res).data;
      expect(data).toMatchObject({
        accessTokenExpiresIn: 900,
        tokenType: 'Bearer',
      });
      expect(data?.user).toMatchObject({ id: user.id, role: 'user' });
      expect(data?.user).not.toHaveProperty('passwordHash');

      const session = await ctx.dataSource
        .getRepository(Session)
        .findOneByOrFail({ userId: user.id });
      expect(session.userAgent).toBe('e2e-test-agent');
      expect(session.ipAddress).toBeTruthy();
    });

    it.each([
      'wrong password',
      'unknown email',
      'agent account',
      'inactive user',
    ])('answers %s with the same generic 401', async (scenario) => {
      let email = 'nobody@test.local';
      if (scenario === 'wrong password') {
        email = (await createUser(ctx.dataSource, UserRole.User)).email;
      }
      if (scenario === 'agent account') {
        email = (await createUser(ctx.dataSource, UserRole.Agent)).email;
      }
      if (scenario === 'inactive user') {
        email = (
          await createUser(ctx.dataSource, UserRole.User, { isActive: false })
        ).email;
      }
      const password = scenario === 'wrong password' ? 'Wrong12345' : PASSWORD;

      const res = await request(ctx.http)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(401);
      expect(body(res).error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      });
    });
  });

  describe('access tokens', () => {
    it('authenticate GET /api/auth/me', async () => {
      const user = await createUser(ctx.dataSource, UserRole.Admin);
      const { accessToken } = await login(ctx.http, user.email);

      const res = await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(accessToken))
        .expect(200);
      expect(body<MeData>(res).data).toMatchObject({
        id: user.id,
        role: 'admin',
        actorType: 'user',
        authMethod: 'jwt',
      });
      expect(body<MeData>(res).data?.sessionId).toBeDefined();
    });

    it('take the role from the database, not from the token', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const { accessToken } = await login(ctx.http, user.email);
      await ctx.dataSource.query(
        `UPDATE users SET role = 'admin' WHERE id = $1`,
        [user.id],
      );

      const res = await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(accessToken))
        .expect(200);
      expect(body<MeData>(res).data?.role).toBe('admin');
    });

    it('stop working immediately when the user is deactivated', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const { accessToken } = await login(ctx.http, user.email);
      await ctx.dataSource.query(
        'UPDATE users SET is_active = false WHERE id = $1',
        [user.id],
      );

      await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(accessToken))
        .expect(401);
    });

    it('are rejected when expired, tampered, unsigned or from another issuer', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const { accessToken } = await login(ctx.http, user.email);
      const jwt = ctx.app.get(JwtService);
      const session = await ctx.dataSource
        .getRepository(Session)
        .findOneByOrFail({ userId: user.id });
      const claims = { sub: user.id, sid: session.id, role: 'user' };
      const options = {
        issuer: 'product-management-api',
        audience: 'product-management-clients',
      };

      const expired = await jwt.signAsync(
        { ...claims, exp: Math.floor(Date.now() / 1000) - 10 },
        options,
      );
      const otherIssuer = await jwt.signAsync(claims, {
        ...options,
        issuer: 'evil',
        expiresIn: 60,
      });
      const otherSecret = await jwt.signAsync(claims, {
        ...options,
        expiresIn: 60,
        secret: 'another-secret-that-is-long-enough-123456',
      });
      const [header, payload] = accessToken.split('.');
      const tampered = `${header}.${payload}x.${accessToken.split('.')[2]}`;
      const noneHeader = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const unsigned = `${noneHeader}.${payload}.`;

      for (const token of [
        expired,
        otherIssuer,
        otherSecret,
        tampered,
        unsigned,
        'garbage',
      ]) {
        const res = await request(ctx.http)
          .get('/api/auth/me')
          .set(bearer(token))
          .expect(401);
        expect(body(res).error).toEqual({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired credentials',
        });
      }
    });

    it('rejects a non-bearer Authorization header with 401', async () => {
      await request(ctx.http)
        .get('/api/auth/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the session: the same access token then gets 401', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const { accessToken } = await login(ctx.http, user.email);

      const res = await request(ctx.http)
        .post('/api/auth/logout')
        .set(bearer(accessToken))
        .expect(200);
      expect(body(res).data).toEqual({ revokedSessions: 1 });

      await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(accessToken))
        .expect(401);
    });

    it('logout-all revokes every session of the user, and only theirs', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const other = await createUser(ctx.dataSource, UserRole.User);
      const first = await login(ctx.http, user.email);
      const second = await login(ctx.http, user.email);
      const otherTokens = await login(ctx.http, other.email);

      const res = await request(ctx.http)
        .post('/api/auth/logout-all')
        .set(bearer(first.accessToken))
        .expect(200);
      expect(body(res).data).toEqual({ revokedSessions: 2 });

      await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(first.accessToken))
        .expect(401);
      await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(second.accessToken))
        .expect(401);
      await request(ctx.http)
        .post('/api/auth/refresh')
        .send({ refreshToken: second.refreshToken })
        .expect(401);
      await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(otherTokens.accessToken))
        .expect(200);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates: the new pair works, the old refresh token is rejected AND revokes the session', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const original = await login(ctx.http, user.email);

      const rotatedRes = await request(ctx.http)
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(200);
      const rotated = body<TokensData>(rotatedRes).data as TokensData;
      expect(rotated.refreshToken).not.toBe(original.refreshToken);
      await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(rotated.accessToken))
        .expect(200);

      // Reuse of the old token: 401, and the whole session is revoked.
      await request(ctx.http)
        .post('/api/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(401);
      const session = await ctx.dataSource
        .getRepository(Session)
        .findOneByOrFail({ userId: user.id });
      expect(session.revokedAt).not.toBeNull();

      await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(rotated.accessToken))
        .expect(401);
      await request(ctx.http)
        .post('/api/auth/refresh')
        .send({ refreshToken: rotated.refreshToken })
        .expect(401);
    });

    it('lets only one of two parallel refreshes with the same token succeed', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const { refreshToken } = await login(ctx.http, user.email);

      const results = await Promise.all([
        request(ctx.http).post('/api/auth/refresh').send({ refreshToken }),
        request(ctx.http).post('/api/auth/refresh').send({ refreshToken }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it.each([
      ['malformed', 'not-a-token'],
      ['unknown session', `${randomUUID()}.${'A'.repeat(43)}`],
    ])('rejects a %s token with 401', async (_label, refreshToken) => {
      await request(ctx.http)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('rejects an expired session', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const { refreshToken } = await login(ctx.http, user.email);
      await ctx.dataSource.query(
        `UPDATE sessions SET expires_at = now() - interval '1 minute'`,
      );

      await request(ctx.http)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('API keys', () => {
    it('a valid agent key authenticates /auth/me with actorType "agent"', async () => {
      const agent = await createUser(ctx.dataSource, UserRole.Agent);
      const { key, apiKey } = await createApiKey(ctx.dataSource, agent);

      const res = await request(ctx.http)
        .get('/api/auth/me')
        .set('X-API-Key', key)
        .expect(200);
      expect(body<MeData>(res).data).toEqual({
        id: agent.id,
        email: agent.email,
        name: agent.name,
        role: 'agent',
        actorType: 'agent',
        authMethod: 'api_key',
        apiKeyId: apiKey.id,
      });
    });

    it('updates last_used_at, at most once per 5 minutes', async () => {
      const agent = await createUser(ctx.dataSource, UserRole.Agent);
      const { key, apiKey } = await createApiKey(ctx.dataSource, agent);
      const keys = ctx.dataSource.getRepository(ApiKey);

      await request(ctx.http)
        .get('/api/auth/me')
        .set('X-API-Key', key)
        .expect(200);
      const first = (await keys.findOneByOrFail({ id: apiKey.id })).lastUsedAt;
      expect(first).not.toBeNull();

      await request(ctx.http)
        .get('/api/auth/me')
        .set('X-API-Key', key)
        .expect(200);
      expect(
        (await keys.findOneByOrFail({ id: apiKey.id })).lastUsedAt,
      ).toEqual(first);
    });

    it.each([
      'revoked',
      'expired',
      'garbage',
      'inactive agent',
      'not an agent',
      'empty',
    ])('rejects a %s key with 401', async (scenario) => {
      const isAgent = scenario !== 'not an agent';
      const owner = await createUser(
        ctx.dataSource,
        isAgent ? UserRole.Agent : UserRole.Admin,
        {
          isActive: scenario !== 'inactive agent',
        },
      );
      const { key } = await createApiKey(ctx.dataSource, owner, {
        revokedAt: scenario === 'revoked' ? new Date() : null,
        expiresAt: scenario === 'expired' ? new Date(Date.now() - 1000) : null,
      });
      let sent = key;
      if (scenario === 'garbage') sent = 'pmk_garbage';
      if (scenario === 'empty') sent = '';

      const res = await request(ctx.http)
        .get('/api/auth/me')
        .set('X-API-Key', sent)
        .expect(401);
      expect(body(res).error?.code).toBe('UNAUTHORIZED');
    });

    it('rejects a request that sends both a bearer token and an API key with 401', async () => {
      const user = await createUser(ctx.dataSource, UserRole.User);
      const agent = await createUser(ctx.dataSource, UserRole.Agent);
      const { accessToken } = await login(ctx.http, user.email);
      const { key } = await createApiKey(ctx.dataSource, agent);

      const res = await request(ctx.http)
        .get('/api/auth/me')
        .set(bearer(accessToken))
        .set('X-API-Key', key)
        .expect(401);
      expect(body(res).error?.code).toBe('UNAUTHORIZED');
    });

    it('agents cannot log out (no session)', async () => {
      const agent = await createUser(ctx.dataSource, UserRole.Agent);
      const { key } = await createApiKey(ctx.dataSource, agent);

      await request(ctx.http)
        .post('/api/auth/logout')
        .set('X-API-Key', key)
        .expect(403);
    });
  });

  it('records register, login and logout in the audit log', async () => {
    await request(ctx.http)
      .post('/api/auth/register')
      .send({ email: 'audit@test.local', name: 'A', password: 'Secret123' })
      .expect(201);
    const { accessToken } = await login(
      ctx.http,
      'audit@test.local',
      'Secret123',
    );
    await request(ctx.http)
      .post('/api/auth/logout')
      .set(bearer(accessToken))
      .expect(200);

    const rows = await ctx.dataSource.query<
      Array<{ action: string; actor_email: string | null }>
    >(
      'SELECT action, actor_email FROM audit_logs ORDER BY occurred_at, action',
    );
    expect(rows.map((row) => row.action)).toEqual([
      'auth.register',
      'auth.login',
      'auth.logout',
    ]);
    expect(rows[1].actor_email).toBe('audit@test.local');
  });

  it('never leaves a revoked session usable (sanity check on the data)', async () => {
    const user = await createUser(ctx.dataSource, UserRole.User);
    await login(ctx.http, user.email);
    const open = await ctx.dataSource
      .getRepository(Session)
      .countBy({ userId: user.id, revokedAt: IsNull() });
    expect(open).toBe(1);
  });
});
