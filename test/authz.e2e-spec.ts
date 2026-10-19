import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  type Actors,
  body,
  createActors,
  createTestApp,
  resetDatabase,
  type TestContext,
} from './utils/test-app';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type Who = 'anonymous' | 'user' | 'admin' | 'superAdmin' | 'agent';

/**
 * The role matrix: every route x every identity -> expected status.
 * Write routes get an empty body: authorization runs BEFORE validation, so an
 * allowed role reaches the validator (400) and a forbidden one stops at 403.
 * Unknown ids give 404 for allowed roles, for the same reason.
 */
const ID = randomUUID();
const MATRIX: Array<[Method, string, Record<Who, number>]> = [
  [
    'get',
    '/api/health',
    { anonymous: 200, user: 200, admin: 200, superAdmin: 200, agent: 200 },
  ],
  // authz-demo
  [
    'get',
    '/api/authz-demo/public',
    { anonymous: 200, user: 200, admin: 200, superAdmin: 200, agent: 200 },
  ],
  [
    'get',
    '/api/authz-demo/any',
    { anonymous: 401, user: 200, admin: 200, superAdmin: 200, agent: 200 },
  ],
  [
    'post',
    '/api/authz-demo/admin-only',
    { anonymous: 401, user: 403, admin: 201, superAdmin: 201, agent: 403 },
  ],
  [
    'post',
    '/api/authz-demo/admin-agent',
    { anonymous: 401, user: 403, admin: 201, superAdmin: 201, agent: 201 },
  ],
  [
    'get',
    '/api/authz-demo/no-roles',
    { anonymous: 401, user: 403, admin: 403, superAdmin: 403, agent: 403 },
  ],
  // auth
  [
    'get',
    '/api/auth/me',
    { anonymous: 401, user: 200, admin: 200, superAdmin: 200, agent: 200 },
  ],
  // users (super_admin only)
  [
    'get',
    '/api/users',
    { anonymous: 401, user: 403, admin: 403, superAdmin: 200, agent: 403 },
  ],
  [
    'patch',
    `/api/users/${ID}/deactivate`,
    { anonymous: 401, user: 403, admin: 403, superAdmin: 404, agent: 403 },
  ],
  [
    'patch',
    `/api/users/${ID}/activate`,
    { anonymous: 401, user: 403, admin: 403, superAdmin: 404, agent: 403 },
  ],
  // audit log
  [
    'get',
    '/api/audit-logs',
    { anonymous: 401, user: 403, admin: 200, superAdmin: 200, agent: 403 },
  ],
  // products: read for all, write for super_admin + admin
  [
    'get',
    '/api/products',
    { anonymous: 401, user: 200, admin: 200, superAdmin: 200, agent: 200 },
  ],
  [
    'get',
    `/api/products/${ID}`,
    { anonymous: 401, user: 404, admin: 404, superAdmin: 404, agent: 404 },
  ],
  [
    'post',
    '/api/products',
    { anonymous: 401, user: 403, admin: 400, superAdmin: 400, agent: 403 },
  ],
  [
    'patch',
    `/api/products/${ID}`,
    { anonymous: 401, user: 403, admin: 404, superAdmin: 404, agent: 403 },
  ],
  [
    'delete',
    `/api/products/${ID}`,
    { anonymous: 401, user: 403, admin: 404, superAdmin: 404, agent: 403 },
  ],
  // categories: read for all, write for super_admin + admin + agent
  [
    'get',
    '/api/categories',
    { anonymous: 401, user: 200, admin: 200, superAdmin: 200, agent: 200 },
  ],
  [
    'get',
    `/api/categories/${ID}`,
    { anonymous: 401, user: 404, admin: 404, superAdmin: 404, agent: 404 },
  ],
  [
    'post',
    '/api/categories',
    { anonymous: 401, user: 403, admin: 400, superAdmin: 400, agent: 400 },
  ],
  [
    'patch',
    `/api/categories/${ID}`,
    { anonymous: 401, user: 403, admin: 404, superAdmin: 404, agent: 404 },
  ],
  [
    'delete',
    `/api/categories/${ID}`,
    { anonymous: 401, user: 403, admin: 404, superAdmin: 404, agent: 404 },
  ],
  [
    'post',
    `/api/categories/${ID}/products`,
    { anonymous: 401, user: 403, admin: 400, superAdmin: 400, agent: 400 },
  ],
  [
    'put',
    `/api/categories/${ID}/products`,
    { anonymous: 401, user: 403, admin: 400, superAdmin: 400, agent: 400 },
  ],
  [
    'delete',
    `/api/categories/${ID}/products/${ID}`,
    { anonymous: 401, user: 403, admin: 404, superAdmin: 404, agent: 404 },
  ],
];

const WHO: Who[] = ['anonymous', 'user', 'admin', 'superAdmin', 'agent'];
const CASES = MATRIX.flatMap(([method, path, expected]) =>
  WHO.map((who) => [method, path, who, expected[who]] as const),
);

describe('Authorization role matrix (e2e)', () => {
  let ctx: TestContext;
  let actors: Actors;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.dataSource);
    actors = await createActors(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const headersFor = (who: Who): Record<string, string> =>
    who === 'anonymous' ? {} : actors[who].headers;

  it.each(CASES)(
    '%s %s as %s -> %i',
    async (method, path, who, expectedStatus) => {
      const res = await request(ctx.http)
        [method](path)
        .set(headersFor(who))
        .send({});

      expect(res.status).toBe(expectedStatus);
      // Every response, success or error, uses the envelope with a request id.
      expect(body(res).meta.requestId).toEqual(expect.any(String));
      if (expectedStatus === 403) {
        expect(body(res).error?.code).toBe('FORBIDDEN');
      }
      if (expectedStatus === 401) {
        expect(body(res).error?.code).toBe('UNAUTHORIZED');
      }
    },
  );

  it('logs every denied attempt in the audit log, including the fail-closed route', async () => {
    await resetDatabase(ctx.dataSource);
    actors = await createActors(ctx);

    await request(ctx.http)
      .get('/api/authz-demo/no-roles')
      .set(actors.admin.headers)
      .expect(403);
    await request(ctx.http)
      .post('/api/products')
      .set(actors.agent.headers)
      .send({})
      .expect(403);

    const rows = await ctx.dataSource.query<
      Array<{
        action: string;
        outcome: string;
        actor_email: string;
        metadata: Record<string, unknown>;
      }>
    >(
      `SELECT action, outcome, actor_email, metadata FROM audit_logs WHERE outcome = 'denied' ORDER BY occurred_at`,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      action: 'access.denied',
      actor_email: actors.admin.user.email,
      metadata: {
        reason: 'no_roles_declared',
        method: 'GET',
        path: '/api/authz-demo/no-roles',
      },
    });
    expect(rows[1]).toMatchObject({
      actor_email: actors.agent.user.email,
      metadata: {
        reason: 'role_not_allowed',
        allowedRoles: ['super_admin', 'admin'],
      },
    });
  });

  it('does not log anonymous 401s as denials (they never reach the roles guard)', async () => {
    await resetDatabase(ctx.dataSource);
    await request(ctx.http).get('/api/users').expect(401);

    const [{ count }] = await ctx.dataSource.query<Array<{ count: string }>>(
      'SELECT count(*) FROM audit_logs',
    );
    expect(Number(count)).toBe(0);
  });
});
