import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { generateApiKey } from '../../src/common/crypto/api-key';
import { ApiKey } from '../../src/modules/auth/entities/api-key.entity';
import { AuthzDemoModule } from '../../src/modules/authz-demo/authz-demo.module';
import { User } from '../../src/modules/users/entities/user.entity';
import { UserRole } from '../../src/modules/users/enums/user-role.enum';

export interface TestContext {
  app: INestApplication;
  http: Server;
  dataSource: DataSource;
}

/**
 * The real application (same modules, same setupApp as main.ts) plus the
 * development-only AuthzDemoModule, against the real test database.
 * Nothing in the auth layer is mocked.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, AuthzDemoModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: ['error'],
  });
  setupApp(app);
  await app.init();

  return {
    app,
    http: app.getHttpServer(),
    dataSource: app.get(DataSource),
  };
}

/** Empties every table (except the migrations table) between tests. */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE users, sessions, api_keys, products, categories, product_categories, audit_logs RESTART IDENTITY CASCADE',
  );
}

export const PASSWORD = 'Passw0rd123';

/** Creates a user directly in the database (bcrypt cost 4: fixtures only need to be valid, not slow). */
export async function createUser(
  dataSource: DataSource,
  role: UserRole,
  overrides: Partial<Pick<User, 'email' | 'isActive' | 'name'>> = {},
): Promise<User> {
  const users = dataSource.getRepository(User);
  return users.save(
    users.create({
      email:
        overrides.email ??
        `${role}-${Math.random().toString(36).slice(2, 10)}@test.local`,
      name: overrides.name ?? `Test ${role}`,
      role,
      isActive: overrides.isActive ?? true,
      passwordHash:
        role === UserRole.Agent ? null : await bcrypt.hash(PASSWORD, 4),
    }),
  );
}

/** Creates an API key for a user and returns the raw key. */
export async function createApiKey(
  dataSource: DataSource,
  user: User,
  overrides: Partial<Pick<ApiKey, 'revokedAt' | 'expiresAt'>> = {},
): Promise<{ key: string; apiKey: ApiKey }> {
  const generated = generateApiKey();
  const apiKeys = dataSource.getRepository(ApiKey);
  const apiKey = await apiKeys.save(
    apiKeys.create({
      userId: user.id,
      name: 'test key',
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      revokedAt: overrides.revokedAt ?? null,
      expiresAt: overrides.expiresAt ?? null,
    }),
  );
  return { key: generated.key, apiKey };
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface LoginBody {
  data: Tokens;
}

/** Logs in through the real HTTP endpoint. */
export async function login(
  http: Server,
  email: string,
  password = PASSWORD,
): Promise<Tokens> {
  const response = await request(http)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return (response.body as LoginBody).data;
}

/** One authenticated identity per role, ready for the role matrix. */
export interface Actors {
  superAdmin: { user: User; headers: Record<string, string> };
  admin: { user: User; headers: Record<string, string> };
  user: { user: User; headers: Record<string, string> };
  agent: { user: User; headers: Record<string, string>; key: string };
}

export async function createActors(ctx: TestContext): Promise<Actors> {
  const [superAdmin, admin, user, agent] = await Promise.all([
    createUser(ctx.dataSource, UserRole.SuperAdmin),
    createUser(ctx.dataSource, UserRole.Admin),
    createUser(ctx.dataSource, UserRole.User),
    createUser(ctx.dataSource, UserRole.Agent),
  ]);
  const { key } = await createApiKey(ctx.dataSource, agent);
  const bearer = async (u: User): Promise<Record<string, string>> => ({
    Authorization: `Bearer ${(await login(ctx.http, u.email)).accessToken}`,
  });

  return {
    superAdmin: { user: superAdmin, headers: await bearer(superAdmin) },
    admin: { user: admin, headers: await bearer(admin) },
    user: { user, headers: await bearer(user) },
    agent: { user: agent, headers: { 'X-API-Key': key }, key },
  };
}

/** The shape every response must have. */
export interface Envelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
  meta: {
    requestId: string;
    timestamp: string;
    path?: string;
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export function body<T = unknown>(response: request.Response): Envelope<T> {
  return response.body as Envelope<T>;
}
