import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { NodeEnv, validateEnv } from '../../src/config/env.validation';
import { buildTypeOrmOptions } from '../../src/database/typeorm.config';

/**
 * Runs once before the e2e suite:
 * 1. creates the test database if it does not exist (its own name, from .env.test),
 * 2. runs all pending migrations (never synchronize).
 * Tables are truncated between tests by resetDatabase().
 */
export default async function globalSetup(): Promise<void> {
  const env = validateEnv(process.env);
  if (env.NODE_ENV !== NodeEnv.Test) {
    throw new Error(
      'e2e tests must run with NODE_ENV=test (use npm run test:e2e)',
    );
  }

  const admin = new Client({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [env.DB_NAME],
    );
    if (exists.rowCount === 0) {
      // Identifiers cannot be bound as parameters; DB_NAME comes from .env.test.
      await admin.query(`CREATE DATABASE "${env.DB_NAME.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }

  const dataSource = new DataSource(buildTypeOrmOptions(env));
  await dataSource.initialize();
  try {
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}
