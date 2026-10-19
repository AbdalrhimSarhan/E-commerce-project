import * as bcrypt from 'bcrypt';
import { DataSource, type EntityManager } from 'typeorm';
import {
  generateApiKey,
  parseApiKey,
  type ParsedApiKey,
} from '../../common/crypto/api-key';
import { validateEnv } from '../../config/env.validation';
import { ApiKey } from '../../modules/auth/entities/api-key.entity';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { buildTypeOrmOptions } from '../typeorm.config';
import { validateSeedEnv } from './seed.env';

/**
 * Idempotent demo data: one super_admin, admin, user and agent, plus an API key
 * for the agent. Running it again creates nothing new.
 *
 * Existing accounts are never modified (passwords are not reset). If the data
 * contradicts the configuration (an email with another role, a second
 * super_admin), the seed fails instead of guessing.
 *
 * Usage: npm run seed   (or `npm run seed:prod` inside the container)
 */

/** Any constant; serializes concurrent seed runs (e.g. two containers starting). */
const SEED_LOCK_ID = 7_241_001;

interface SeedAccount {
  email: string;
  name: string;
  role: UserRole;
  /** undefined for the agent: agents never have a password. */
  password?: string;
}

class SeedConflictError extends Error {}

function log(message: string): void {
  console.log(`[seed] ${message}`);
}

async function ensureUser(
  manager: EntityManager,
  account: SeedAccount,
  bcryptRounds: number,
): Promise<User> {
  const users = manager.getRepository(User);

  const existing = await users.findOneBy({ email: account.email });
  if (existing) {
    if (existing.role !== account.role) {
      throw new SeedConflictError(
        `${account.email} already exists with role '${existing.role}', expected '${account.role}'`,
      );
    }
    const state = existing.isActive ? '' : ' (inactive, left as is)';
    log(`exists   ${account.role.padEnd(11)} ${account.email}${state}`);
    return existing;
  }

  if (account.role === UserRole.SuperAdmin) {
    const otherSuperAdmin = await users.findOneBy({
      role: UserRole.SuperAdmin,
    });
    if (otherSuperAdmin) {
      throw new SeedConflictError(
        `a super_admin already exists (${otherSuperAdmin.email}); there can be only one`,
      );
    }
  }

  const passwordHash =
    account.password === undefined
      ? null
      : await bcrypt.hash(account.password, bcryptRounds);

  const created = await users.save(
    users.create({
      email: account.email,
      name: account.name,
      role: account.role,
      passwordHash,
      isActive: true,
    }),
  );
  log(`created  ${account.role.padEnd(11)} ${account.email}`);
  return created;
}

/**
 * Makes sure the agent has a usable key.
 * Returns the raw key only when a random key was generated now, so the caller
 * can print it once, after the transaction has committed.
 */
async function ensureAgentApiKey(
  manager: EntityManager,
  agent: User,
  configuredKey: string | undefined,
): Promise<string | undefined> {
  const apiKeys = manager.getRepository(ApiKey);

  if (configuredKey !== undefined) {
    // Fixed key from SEED_AGENT_API_KEY: make sure exactly this key exists and works.
    const parsed = parseApiKey(configuredKey) as ParsedApiKey; // format already validated
    const existing = await apiKeys.findOneBy({ keyHash: parsed.keyHash });

    if (existing) {
      if (existing.userId !== agent.id) {
        throw new SeedConflictError(
          'SEED_AGENT_API_KEY belongs to another user',
        );
      }
      if (existing.revokedAt !== null) {
        throw new SeedConflictError(
          `SEED_AGENT_API_KEY (${existing.keyPrefix}) is revoked; set a new key`,
        );
      }
      if (existing.expiresAt !== null && existing.expiresAt <= new Date()) {
        throw new SeedConflictError(
          `SEED_AGENT_API_KEY (${existing.keyPrefix}) is expired; set a new key`,
        );
      }
      log(
        `exists   api key     ${existing.keyPrefix}… (from SEED_AGENT_API_KEY)`,
      );
      return undefined;
    }

    await apiKeys.save(
      apiKeys.create({
        userId: agent.id,
        name: 'Seed key (SEED_AGENT_API_KEY)',
        keyPrefix: parsed.keyPrefix,
        keyHash: parsed.keyHash,
        expiresAt: null,
      }),
    );
    log(`created  api key     ${parsed.keyPrefix}… (from SEED_AGENT_API_KEY)`);
    return undefined;
  }

  // No fixed key: keep any active key, otherwise generate one.
  const activeKey = await apiKeys
    .createQueryBuilder('key')
    .where('key.user_id = :userId', { userId: agent.id })
    .andWhere('key.revoked_at IS NULL')
    .andWhere('(key.expires_at IS NULL OR key.expires_at > now())')
    .getOne();

  if (activeKey) {
    log(
      `notice   the agent already has an active API key (${activeKey.keyPrefix}…); not creating another`,
    );
    return undefined;
  }

  const generated = generateApiKey();
  await apiKeys.save(
    apiKeys.create({
      userId: agent.id,
      name: 'Seed key (generated)',
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      expiresAt: null,
    }),
  );
  log(`created  api key     ${generated.keyPrefix}…`);
  return generated.key;
}

function printNewKeyOnce(key: string): void {
  const line = '='.repeat(72);
  console.log(
    [
      line,
      '  NEW AGENT API KEY (shown only this once, it is not stored)',
      `  ${key}`,
      '  Send it as the X-API-Key header.',
      line,
    ].join('\n'),
  );
}

async function seed(): Promise<void> {
  const env = validateEnv(process.env);
  const seedEnv = validateSeedEnv(process.env);

  const accounts: SeedAccount[] = [
    {
      email: seedEnv.SEED_SUPER_ADMIN_EMAIL,
      name: 'Super Admin',
      role: UserRole.SuperAdmin,
      password: seedEnv.SEED_SUPER_ADMIN_PASSWORD,
    },
    {
      email: seedEnv.SEED_ADMIN_EMAIL,
      name: 'Admin',
      role: UserRole.Admin,
      password: seedEnv.SEED_ADMIN_PASSWORD,
    },
    {
      email: seedEnv.SEED_USER_EMAIL,
      name: 'Demo User',
      role: UserRole.User,
      password: seedEnv.SEED_USER_PASSWORD,
    },
    { email: seedEnv.SEED_AGENT_EMAIL, name: 'AI Agent', role: UserRole.Agent },
  ];

  const dataSource = new DataSource(buildTypeOrmOptions(env));
  await dataSource.initialize();

  try {
    // Everything or nothing: a failure leaves the database unchanged.
    const newKey = await dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [SEED_LOCK_ID]);

      let agent: User | undefined;
      for (const account of accounts) {
        const user = await ensureUser(manager, account, env.BCRYPT_ROUNDS);
        if (account.role === UserRole.Agent) {
          agent = user;
        }
      }

      return ensureAgentApiKey(
        manager,
        agent as User,
        seedEnv.SEED_AGENT_API_KEY,
      );
    });

    if (newKey !== undefined) {
      printNewKeyOnce(newKey);
    }
    log('done');
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    error instanceof SeedConflictError
      ? `[seed] FAILED (nothing was changed): ${message}`
      : `[seed] FAILED: ${message}`,
  );
  process.exit(1);
});
