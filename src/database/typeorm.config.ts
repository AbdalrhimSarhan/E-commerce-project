import { join } from 'node:path';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import type { EnvironmentVariables } from '../config/env.validation';

export type DatabaseEnv = Pick<
  EnvironmentVariables,
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_USERNAME'
  | 'DB_PASSWORD'
  | 'DB_NAME'
  | 'DB_LOGGING'
>;

/**
 * The single source of database options, used by the app (DatabaseModule)
 * and by the TypeORM CLI (data-source.ts).
 */
export function buildTypeOrmOptions(
  env: DatabaseEnv,
): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    logging: env.DB_LOGGING,

    // The schema is changed ONLY by migrations, in every environment.
    synchronize: false,
    migrationsRun: false,

    // Globs cover both `src` (.ts) and the compiled `dist` (.js).
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations',

    // UUID defaults use gen_random_uuid(), built into PostgreSQL 13+. No
    // extension (and no superuser right to create one) is needed.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}
