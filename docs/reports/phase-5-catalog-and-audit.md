# Phase 5: Products, categories and audit log

Not part of `docs/prompt-1.md` (it said "later prompts"). You asked on
2026-10-18 to build everything except the MCP server, so this phase follows
`backend-task.md` §2.1, §2.3 (agent permissions), §3 and the design rules
already in place.

## Summary

- Products and categories with full CRUD, validation, pagination, filtering and
  sorting; a many-to-many relationship through `product_categories`.
- Category ↔ product link management (`add`, `replace`, `remove one`) as a
  sub-resource, usable by agents.
- An append-only audit log for every write and every denied attempt, written in
  the same transaction as the change; `GET /api/audit-logs` with filters.
- One generated migration, plus two hand-written parts (an expression index and
  the append-only trigger), with a complete `down()`.
- `docs/database.md` (ERD), `docs/design-decisions.md`, a new README.

## Files

| File | Purpose |
| --- | --- |
| `src/modules/products/**` | entity, DTOs, service, controller, module |
| `src/modules/categories/**` | Category + ProductCategory entities, DTOs, service (incl. links), controller, module |
| `src/modules/audit/**` | AuditLog entity, enums, `AuditService.record()` (in-transaction) / `recordStandalone()`, `RequestActor`, list endpoint |
| `src/database/migrations/1792334513131-CreateCatalogAndAuditTables.ts` | tables, constraints, `UQ_categories_name_lower`, append-only trigger |
| `src/common/audit-diff.ts` (+ spec) | `diffChanges()` for `{from,to}` diffs, `escapeLike()` |
| `src/common/dto/*` | pagination query, transforms, limits |
| `src/common/swagger/deleted.dto.ts` | `{ id }` payload of DELETE |
| `docs/database.md`, `docs/design-decisions.md`, `README.md` | documentation |

## Permissions (from backend-task.md)

- **admin** (and super_admin): read and modify products and categories.
- **user**: read only.
- **agent**: read everything (with relationships); create, update and delete
  categories and manage their product links; **no product writes**.

## Decisions not specified anywhere

1. **Products have `sku` (unique, uppercase), `price numeric(12,2)` (a decimal
   string in the API), `stock`, `is_active`**; categories have a case-insensitive
   unique `name`. Both have a nullable `description` (max 5000 / 2000).
2. **Hard delete for products and categories**, cascading to links only, with a
   full "before" snapshot in the audit log. (Users are never deleted.)
3. **Unknown related ids → 400** with `details: [{ field: 'categoryIds' | 'productIds', message: 'unknown … id(s): …' }]`
   and nothing written. An unknown id in the URL → 404.
4. **`categoryIds` on product update replaces the set**; category links have
   their own endpoints (add is idempotent, remove-one returns 404 if not linked,
   replace = exact set). At most 100 ids per request.
5. **Row locks** on the product/category being changed, so audit "before" values
   are always exact and concurrent link replaces never mix (tested).
6. **No-op updates are not audited**; link operations audit only real changes
   (`added`, `removed`).
7. **The audit log also covers auth events** (register, login, logout,
   logout-all, refresh-token reuse) and account management.
8. **Append-only by trigger**; `TRUNCATE` still works for the DB owner (tests).
9. **The search is `ILIKE` with escaped wildcards**; no trigram index (it would
   need an extension). That's fine at this scale.
10. **Products list:** one count+page query and one query for the categories of
    the page (no N+1, no join pagination problems).

## Verification

- `test/catalog.e2e-spec.ts` (27 tests) and the catalog rows of the role matrix.
- Migration: `migration:run` → `migration:revert` (only the Phase 1 tables remain,
  the trigger function is gone) → `migration:run` → `migration:generate` reports
  "No changes" (verified).
- Constraints checked in psql: duplicate name with different case, blank name,
  lowercase SKU, negative price/stock → rejected; `UPDATE`/`DELETE` on
  `audit_logs` → "audit_logs is append-only".
- Docker smoke test (production mode): admin login, agent `me`, authz-demo 404,
  the agent creates/deletes a category, the admin creates/deletes a product, and
  the audit log lists all of it with actor types.

## Suggested commits

Phase 1 is still uncommitted too, so all of it is listed in order.
Shared files (`package.json`, `.env.example`, `env.validation.ts`, `README.md`,
`app.module.ts`) contain their final content and are committed where they are
first needed.

1. `feat(users): add user, session and api key entities with initial migration`
2. `feat(common): add api key and hashing helpers`
3. `feat(database): add idempotent seed and run it on container start`
4. `feat(auth): add jwt authentication, sessions, refresh rotation and api keys`
5. `feat(auth): add role guards, fail-closed authorization and account management`
6. `feat(catalog): add products, categories and their many-to-many links`
7. `feat(audit): add append-only audit log for writes and denied attempts`
8. `test: add e2e suite against a real database, runnable in docker`
9. `docs: add ERD, design decisions, README and phase reports`

The exact `git add` commands are in the final message of this session.

## My Review

