import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { IsNull } from 'typeorm';
import { Session } from '../src/modules/auth/entities/session.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import {
  type Actors,
  body,
  createActors,
  createApiKey,
  createTestApp,
  createUser,
  login,
  resetDatabase,
  type TestContext,
} from './utils/test-app';

interface UserData {
  id: string;
  role: string;
  isActive: boolean;
}

describe('Account management (e2e)', () => {
  let ctx: TestContext;
  let actors: Actors;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    actors = await createActors(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const asSuperAdmin = () => actors.superAdmin.headers;

  describe('GET /api/users', () => {
    it('lists users with pagination meta and never exposes password hashes', async () => {
      const res = await request(ctx.http)
        .get('/api/users?page=1&limit=2')
        .set(asSuperAdmin())
        .expect(200);

      expect(body<UserData[]>(res).data).toHaveLength(2);
      expect(body(res).meta).toMatchObject({
        page: 1,
        limit: 2,
        total: 4,
        totalPages: 2,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it('filters by role and isActive', async () => {
      await createUser(ctx.dataSource, UserRole.User, { isActive: false });

      const users = await request(ctx.http)
        .get('/api/users?role=user')
        .set(asSuperAdmin())
        .expect(200);
      expect(
        body<UserData[]>(users).data?.every((u) => u.role === 'user'),
      ).toBe(true);
      expect(body(users).meta.total).toBe(2);

      const inactive = await request(ctx.http)
        .get('/api/users?isActive=false')
        .set(asSuperAdmin())
        .expect(200);
      expect(body(inactive).meta.total).toBe(1);
    });

    it('rejects invalid filters with 400', async () => {
      await request(ctx.http)
        .get('/api/users?role=root')
        .set(asSuperAdmin())
        .expect(400);
      await request(ctx.http)
        .get('/api/users?isActive=maybe')
        .set(asSuperAdmin())
        .expect(400);
      await request(ctx.http)
        .get('/api/users?limit=1000')
        .set(asSuperAdmin())
        .expect(400);
    });
  });

  describe('PATCH /api/users/:id/deactivate', () => {
    it('deactivates and revokes all sessions in one go; old tokens stop working', async () => {
      const target = actors.user.user;
      const second = await login(ctx.http, target.email);

      const res = await request(ctx.http)
        .patch(`/api/users/${target.id}/deactivate`)
        .set(asSuperAdmin())
        .expect(200);
      expect(body<UserData>(res).data).toMatchObject({
        id: target.id,
        isActive: false,
      });

      const open = await ctx.dataSource
        .getRepository(Session)
        .countBy({ userId: target.id, revokedAt: IsNull() });
      expect(open).toBe(0);

      await request(ctx.http)
        .get('/api/auth/me')
        .set(actors.user.headers)
        .expect(401);
      await request(ctx.http)
        .post('/api/auth/refresh')
        .send({ refreshToken: second.refreshToken })
        .expect(401);
      await request(ctx.http)
        .post('/api/auth/login')
        .send({ email: target.email, password: 'Passw0rd123' })
        .expect(401);
    });

    it('makes a deactivated agent key fail without revoking it', async () => {
      await request(ctx.http)
        .patch(`/api/users/${actors.agent.user.id}/deactivate`)
        .set(asSuperAdmin())
        .expect(200);

      await request(ctx.http)
        .get('/api/auth/me')
        .set('X-API-Key', actors.agent.key)
        .expect(401);
    });

    it('refuses to deactivate a super_admin (also prevents self-lockout) with 403', async () => {
      const res = await request(ctx.http)
        .patch(`/api/users/${actors.superAdmin.user.id}/deactivate`)
        .set(asSuperAdmin())
        .expect(403);
      expect(body(res).error?.code).toBe('FORBIDDEN');

      await request(ctx.http)
        .get('/api/auth/me')
        .set(asSuperAdmin())
        .expect(200);
    });

    it('answers an unknown id with 404 and a malformed id with 400', async () => {
      await request(ctx.http)
        .patch(`/api/users/${randomUUID()}/deactivate`)
        .set(asSuperAdmin())
        .expect(404);
      await request(ctx.http)
        .patch('/api/users/not-a-uuid/deactivate')
        .set(asSuperAdmin())
        .expect(400);
    });

    it('is audited with the number of revoked sessions', async () => {
      await request(ctx.http)
        .patch(`/api/users/${actors.admin.user.id}/deactivate`)
        .set(asSuperAdmin())
        .expect(200);

      const [row] = await ctx.dataSource.query<
        Array<{
          actor_email: string;
          resource_id: string;
          changes: Record<string, unknown>;
        }>
      >(
        `SELECT actor_email, resource_id, changes FROM audit_logs WHERE action = 'user.deactivate'`,
      );
      expect(row).toEqual({
        actor_email: actors.superAdmin.user.email,
        resource_id: actors.admin.user.id,
        changes: { isActive: { from: true, to: false }, revokedSessions: 1 },
      });
    });
  });

  describe('PATCH /api/users/:id/activate', () => {
    it('reactivates the account; old sessions stay revoked, a new login works', async () => {
      const target = actors.user.user;
      await request(ctx.http)
        .patch(`/api/users/${target.id}/deactivate`)
        .set(asSuperAdmin())
        .expect(200);

      const res = await request(ctx.http)
        .patch(`/api/users/${target.id}/activate`)
        .set(asSuperAdmin())
        .expect(200);
      expect(body<UserData>(res).data?.isActive).toBe(true);

      await request(ctx.http)
        .get('/api/auth/me')
        .set(actors.user.headers)
        .expect(401);
      const fresh = await login(ctx.http, target.email);
      await request(ctx.http)
        .get('/api/auth/me')
        .set({ Authorization: `Bearer ${fresh.accessToken}` })
        .expect(200);
    });

    it('re-enables a reactivated agent key', async () => {
      const agent = await createUser(ctx.dataSource, UserRole.Agent, {
        isActive: false,
      });
      const { key } = await createApiKey(ctx.dataSource, agent);
      await request(ctx.http)
        .get('/api/auth/me')
        .set('X-API-Key', key)
        .expect(401);

      await request(ctx.http)
        .patch(`/api/users/${agent.id}/activate`)
        .set(asSuperAdmin())
        .expect(200);
      await request(ctx.http)
        .get('/api/auth/me')
        .set('X-API-Key', key)
        .expect(200);
    });
  });

  it('has no endpoint to delete a user', async () => {
    await request(ctx.http)
      .delete(`/api/users/${actors.user.user.id}`)
      .set(asSuperAdmin())
      .expect(404);
  });
});
