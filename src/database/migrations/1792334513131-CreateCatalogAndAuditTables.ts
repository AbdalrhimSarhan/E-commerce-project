/**
 * Products, categories (many-to-many through product_categories) and the
 * append-only audit log. Generated with `npm run migration:generate`, then two
 * hand-written parts were added (marked below): the case-insensitive unique
 * index on category names and the append-only trigger on audit_logs.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogAndAuditTables1792334513131 implements MigrationInterface {
  name = 'CreateCatalogAndAuditTables1792334513131';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(100) NOT NULL, "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_categories_description_length" CHECK (char_length("description") <= 2000), CONSTRAINT "CHK_categories_name_not_blank" CHECK (char_length(btrim("name")) > 0), CONSTRAINT "PK_categories" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_categories" ("product_id" uuid NOT NULL, "category_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_product_categories" PRIMARY KEY ("product_id", "category_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_categories_category_id" ON "product_categories" ("category_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "sku" character varying(64) NOT NULL, "name" character varying(200) NOT NULL, "description" text, "price" numeric(12,2) NOT NULL, "stock" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_products_sku" UNIQUE ("sku"), CONSTRAINT "CHK_products_stock_non_negative" CHECK ("stock" >= 0), CONSTRAINT "CHK_products_price_non_negative" CHECK ("price" >= 0), CONSTRAINT "CHK_products_description_length" CHECK (char_length("description") <= 5000), CONSTRAINT "CHK_products_name_not_blank" CHECK (char_length(btrim("name")) > 0), CONSTRAINT "CHK_products_sku_format" CHECK ("sku" ~ '^[A-Z0-9][A-Z0-9-]{0,63}$'), CONSTRAINT "PK_products" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'agent', 'anonymous')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_outcome" AS ENUM('success', 'denied')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actor_id" uuid, "actor_type" "public"."audit_actor_type" NOT NULL, "actor_email" character varying(255), "actor_role" character varying(32), "auth_method" character varying(16), "action" character varying(64) NOT NULL, "outcome" "public"."audit_outcome" NOT NULL, "resource_type" character varying(32), "resource_id" uuid, "changes" jsonb, "metadata" jsonb, "request_id" character varying(64), "ip_address" character varying(45), CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actor_id" ON "audit_logs" ("actor_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_resource" ON "audit_logs" ("resource_type", "resource_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_occurred_at" ON "audit_logs" ("occurred_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "FK_product_categories_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "FK_product_categories_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_logs_actor_id" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // --- Added by hand (TypeORM cannot generate these) ---

    // Category names are unique ignoring case: "Keyboards" and "keyboards" conflict (23505 -> 409).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_categories_name_lower" ON "categories" (lower("name"))`,
    );

    // The audit log is append-only: any UPDATE or DELETE of a row fails.
    // (TRUNCATE is still possible for the database owner, e.g. in tests.)
    await queryRunner.query(`
            CREATE FUNCTION "audit_logs_prevent_change"() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'audit_logs is append-only (% is not allowed)', TG_OP;
            END;
            $$`);
    await queryRunner.query(`
            CREATE TRIGGER "TRG_audit_logs_append_only"
            BEFORE UPDATE OR DELETE ON "audit_logs"
            FOR EACH ROW EXECUTE FUNCTION "audit_logs_prevent_change"()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_audit_logs_append_only" ON "audit_logs"`,
    );
    await queryRunner.query(`DROP FUNCTION "audit_logs_prevent_change"()`);
    await queryRunner.query(`DROP INDEX "public"."UQ_categories_name_lower"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_audit_logs_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT "FK_product_categories_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT "FK_product_categories_product_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_occurred_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_resource"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_actor_id"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_outcome"`);
    await queryRunner.query(`DROP TYPE "public"."audit_actor_type"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_product_categories_category_id"`,
    );
    await queryRunner.query(`DROP TABLE "product_categories"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
