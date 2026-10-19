# Phase 1: Authentication Data Model

## Summary

- The `users`, `sessions` and `api_keys` tables and the `user_role` enum
  (`super_admin`, `admin`, `user`, `agent`), in **one generated migration** with
  a complete `down()`.
- Database-level integrity: normalized emails, the password-by-role rule, at most
  one super_admin, FK cascades, unique hashes, `user_id` indexes. Every constraint
  has an explicit name.
- Helpers for secrets: sha256, random secrets, constant-time compare, and the
  `pmk_<prefix>_<secret>` API key format.
- An idempotent seed (`npm run seed`) for super_admin, admin, user and agent plus
  the agent's API key. It optionally runs on container start (`SEED_ON_STARTUP`).
- The Docker Postgres is published on host port **5433**.

Design changes A–E from the Phase 0 approval are applied. C (account management
endpoints) is planned for Phase 3 and was not implemented now.

## Schema

```
user_role = ENUM ('super_admin', 'admin', 'user', 'agent')

users
  id             uuid PK DEFAULT gen_random_uuid()            PK_users
  email          varchar(255) NOT NULL                        UQ_users_email
  password_hash  varchar(255) NULL
  name           varchar(100) NOT NULL
  role           user_role NOT NULL DEFAULT 'user'
  is_active      boolean NOT NULL DEFAULT true
  created_at     timestamptz NOT NULL DEFAULT now()
  updated_at     timestamptz NOT NULL DEFAULT now()
  CHK_users_email_normalized   CHECK (email = lower(btrim(email)))
  CHK_users_password_by_role   CHECK ((role = 'agent') = (password_hash IS NULL))
  UQ_users_single_super_admin  UNIQUE INDEX (role) WHERE role = 'super_admin'

sessions
  id                  uuid PK                                 PK_sessions
  user_id             uuid NOT NULL -> users.id ON DELETE CASCADE   FK_sessions_user_id, IDX_sessions_user_id
  refresh_token_hash  varchar(64) NOT NULL                    UQ_sessions_refresh_token_hash
  user_agent          varchar(512) NULL
  ip_address          varchar(45) NULL
  expires_at          timestamptz NOT NULL
  revoked_at          timestamptz NULL
  last_used_at        timestamptz NULL
  created_at          timestamptz NOT NULL DEFAULT now()

api_keys
  id            uuid PK                                       PK_api_keys
  user_id       uuid NOT NULL -> users.id ON DELETE CASCADE   FK_api_keys_user_id, IDX_api_keys_user_id
  name          varchar(100) NOT NULL
  key_prefix    varchar(16) NOT NULL
  key_hash      varchar(64) NOT NULL                          UQ_api_keys_key_hash
  expires_at    timestamptz NULL
  revoked_at    timestamptz NULL
  last_used_at  timestamptz NULL
  created_at    timestamptz NOT NULL DEFAULT now()
```

## Files changed

| File | Purpose |
| --- | --- |
| `src/modules/users/enums/user-role.enum.ts` | `UserRole`, including `super_admin` |
| `src/modules/users/entities/user.entity.ts` | users table, CHECKs, single-super_admin index |
| `src/modules/auth/entities/session.entity.ts` | sessions table |
| `src/modules/auth/entities/api-key.entity.ts` | api_keys table |
| `src/modules/users/utils/normalize-email.ts` (+ spec) | trim + lowercase |
| `src/modules/users/constants/password-policy.ts` | 8-72 chars, a letter and a digit |
| `src/database/migrations/1792327286883-CreateAuthTables.ts` | the one migration (generated, SQL unchanged) |
| `src/database/typeorm.config.ts` | `uuidExtension: 'pgcrypto'`, `installExtensions: false` |
| `src/common/crypto/hashing.ts` (+ spec) | `sha256Hex`, `randomSecret`, `hashesEqual` |
| `src/common/crypto/api-key.ts` (+ spec) | `generateApiKey`, `parseApiKey`, `API_KEY_PATTERN` |
| `src/database/seeds/seed.env.ts` (+ spec) | `SEED_*` validation |
| `src/database/seeds/seed.ts` | the seed |
| `src/config/env.validation.ts` (+ spec) | `BCRYPT_ROUNDS`; generic `validateConfig()`; `DB_PORT` default 5433 |
| `docker/entrypoint.sh` | migrations, seed when `SEED_ON_STARTUP=true`, start |
| `package.json`, `package-lock.json` | `bcrypt`, `@types/bcrypt`; `seed`, `seed:prod` scripts |
| `.env.example` | `BCRYPT_ROUNDS`, `SEED_ON_STARTUP`, `SEED_*`, marked dev agent key |
| `README.md` | seed section, seed variables, security note, port 5433 |

## Dependencies added

| Package | Why |
| --- | --- |
| `bcrypt` 6.0.0 | Password hashing (salted, adaptive cost). Native module, which is why the image uses Debian slim |
| `@types/bcrypt` (dev) | Types |

## Decisions not specified in the prompt

1. **Three stricter constraints (you approved them):**
   - `email = lower(btrim(email))`, which also enforces the trim the prompt asks for.
   - `(role = 'agent') = (password_hash IS NULL)`: an agent can never get a password.
   - A partial unique index allowing at most one super_admin.
2. **Explicit constraint names** (`PK_users`, `UQ_users_email`, `FK_sessions_user_id`,
   ...) instead of TypeORM's hashes, so `\d users` and error logs are readable.
3. **`gen_random_uuid()` without an extension.** It is built into PostgreSQL 13+;
   `installExtensions: false` means TypeORM never runs `CREATE EXTENSION`, so the
   DB user needs no superuser rights.
4. **Only `ManyToOne` relations (session → user, api key → user), no
   `OneToMany` on User.** This avoids circular imports, and nothing needs
   `user.sessions` yet.
5. **API key prefix is hex** (`randomBytes(4)`). base64url can contain `_`, which
   would make `pmk_<prefix>_<secret>` ambiguous to split. `key_prefix` stores
   `pmk_<8 hex>` (12 chars).
6. **`hashesEqual()` (constant-time compare)** was added now, for the refresh-token
   check in Phase 2.
7. **Password policy 8-72 characters.** 72 bytes is bcrypt's input limit; longer
   passwords would be silently truncated, so they are rejected. Note: the limit
   counts characters, so a password of 72 multi-byte characters could still exceed
   72 bytes. Phase 2 can switch to a byte-length check if needed.
8. **The seed never modifies existing rows** and fails on contradictions (an email
   with another role, a second super_admin, a revoked/expired/foreign fixed key)
   instead of guessing.
9. **`SEED_AGENT_API_KEY` semantics (approved):** with a fixed key, the seed makes
   sure *that* key exists and is active; other keys are left alone. Without it, the
   prompt's rule applies: an active key → notice only; otherwise generate and
   print once.
10. **A generated key is printed only after the transaction commits,** so a key
    that was rolled back is never shown.
11. **Advisory lock (`pg_advisory_xact_lock`)** at the start of the seed
    transaction, so concurrent seeds (e.g. two containers) run one after the
    other. Tested: two parallel runs → 4 users, 1 key.
12. **Separate seed env class.** The app never requires `SEED_*`. The seed
    validates both the app env (DB, `BCRYPT_ROUNDS`) and the seed env, and checks
    that the four emails differ after normalization.
13. **`BCRYPT_ROUNDS`** (default 12, range 10-15) was added to the app env now; the
    seed uses it, and register/login will use it in Phase 2.
14. **`SEED_ON_STARTUP` is strict:** only `true` or `false`; any other value stops
    the container, so a typo doesn't silently skip the seed.
15. **Host port 5433** (your change). It is now also the code default of `DB_PORT`.
    Inside the `api` container Compose sets `DB_PORT=5432` (`db:5432` on the
    internal network).
16. **Account names are fixed in code** ("Super Admin", "Admin", "Demo User",
    "AI Agent"); only emails and passwords come from env.

No conflicts with `backend-task.md`. Rule B (never hard-delete users) supports
the audit-log requirement: audit rows will always point to an existing user.

## Verification

| # | Command | Expected |
| --- | --- | --- |
| 1 | `npm run lint; npm test` | 0 problems; `Tests: 74 passed` |
| 2 | `docker compose down -v; docker compose up -d --build` | both services `healthy` |
| 3 | `docker compose logs api` | `CreateAuthTables… executed successfully`, then `[seed] created …` x4 + `created api key pmk_00000000…`, then `API listening` |
| 4 | `docker compose restart api`, then logs | `[seed] exists …` for everything, nothing created |
| 5 | `docker compose exec db psql -U postgres -d product_management -c "\d users"` | the constraints and indexes listed above |
| 6 | `... -c "SELECT email, role, left(password_hash,7) FROM users"` | 4 rows; `$2b$12$` for humans, empty for the agent |
| 7 | `... -c "SELECT key_prefix, key_hash FROM api_keys"` | `pmk_00000000` + 64-char hash; the raw key is nowhere in the DB |
| 8 | `... -c "INSERT INTO users (email,password_hash,name,role) VALUES ('x@x.com','h','x','super_admin')"` | `UQ_users_single_super_admin` violation |
| 9 | `npm run migration:revert`, then `\dt` | only `migrations` remains; `user_role` type gone |
| 10 | `npm run migration:run` | runs again without errors |
| 11 | `npm run seed` (after 10, empty tables) | creates everything; a second `npm run seed` creates nothing |
| 12 | set `SEED_AGENT_API_KEY=` (empty) in `.env`, `npm run seed` | "notice: the agent already has an active API key" |
| 13 | pgAdmin → `localhost:5433`, user/password from `.env` | connects to the Docker database |

Also run during implementation: CHECK violations (uppercase email, an email with
a leading space, a user without a password, an agent with a password), the enum
rejecting `'root'`, FK rejection, cascade delete, the drift check
(`migration:generate` → "No changes"), a generated key printed once, a revoked
fixed key → failure, role conflict → full rollback, second super_admin →
failure, bad env → failure before connecting, two parallel seeds → no duplicates.

## Commits

1. `feat(users): add user, session and api key entities with initial migration`
2. `feat(common): add api key and hashing helpers`
3. `feat(database): add idempotent seed and run it on container start` (commits 3 and 4 combined, as you asked)

## My Review

