/**
 * Phase 1: authentication tables (users, sessions, api_keys) and the user_role enum.
 * Generated with `npm run migration:generate`, reviewed by hand (SQL unchanged).
 * Constraint names are set explicitly in the entities so they read well in psql.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1792327286883 implements MigrationInterface {
  name = 'CreateAuthTables1792327286883';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'user', 'agent')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(255) NOT NULL, "password_hash" character varying(255), "name" character varying(100) NOT NULL, "role" "public"."user_role" NOT NULL DEFAULT 'user', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_users_email" UNIQUE ("email"), CONSTRAINT "CHK_users_password_by_role" CHECK (("role" = 'agent') = ("password_hash" IS NULL)), CONSTRAINT "CHK_users_email_normalized" CHECK ("email" = lower(btrim("email"))), CONSTRAINT "PK_users" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_single_super_admin" ON "users" ("role") WHERE "role" = 'super_admin'`,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "refresh_token_hash" character varying(64) NOT NULL, "user_agent" character varying(512), "ip_address" character varying(45), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash"), CONSTRAINT "PK_sessions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sessions_user_id" ON "sessions" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "api_keys" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "key_prefix" character varying(16) NOT NULL, "key_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_api_keys_key_hash" UNIQUE ("key_hash"), CONSTRAINT "PK_api_keys" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_api_keys_user_id" ON "api_keys" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD CONSTRAINT "FK_api_keys_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "api_keys" DROP CONSTRAINT "FK_api_keys_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_sessions_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_api_keys_user_id"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_sessions_user_id"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_users_single_super_admin"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
  }
}
