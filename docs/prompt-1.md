# Project Context

I am building a technical assessment for a NestJS backend developer position:
a Product Management REST API (products, categories, many-to-many relationship)
with role-based access, an audit log, and later an MCP server that lets AI agents
operate on the system through the same API.

This prompt covers ONLY the foundation and authentication/authorization.
Products, categories, audit logging, and the MCP server will come in later prompts.
Do not implement anything outside the scope of the current phase.

# Reference Document

The attached `backend-task.md` is the full assessment description, given to you
for context only. Rules:
- This prompt is the source of truth. Where this prompt is more specific or makes
  a different design decision than the task document, follow this prompt.
- Do NOT implement anything from the task document that is outside the current
  phase, even if it seems related.
- If you notice that something in the current phase conflicts with a requirement
  in the task document, tell me in your report instead of silently changing it.
  
# How We Work (strict rules)

1. The work is split into phases (0 to 4). Implement ONE phase at a time.
2. At the end of each phase, STOP and give me a report containing:
   - Files created/modified, with a one-line purpose each.
   - Any decision you made that this prompt did not specify, with your reasoning.
   - Exact commands I should run to verify the phase, and the expected results.
   - Suggested commit messages (Conventional Commits), split into small logical commits.
3. Do NOT start the next phase until I reply with exactly: "APPROVED phase N".
   If I report a problem, fix it within the same phase and report again.
4. Do NOT run any git commands. I commit and manage branches myself.
5. If something is ambiguous, ASK me instead of assuming.
6. Do not add any dependency without listing it and explaining why it is needed.
7. TypeScript strict mode. No `any`. No disabled lint rules without a stated reason.
8. Never modify a migration that has already been run. Create a new migration instead.
9. Keep code readable over clever. I must be able to explain every line in an interview.
10. At the end of each phase, also write the same report as a Markdown file at
    `docs/reports/phase-<N>-<short-name>.md` (e.g. `phase-0-foundation.md`).
    Include: summary, files changed, decisions not specified in the prompt and
    their reasoning, verification commands with expected results, and suggested
    commits. Leave an empty section at the end titled "## My Review" for me to fill in.

# Tech Stack

- Node.js (current LTS), NestJS (current stable), TypeScript (strict)
- PostgreSQL 16
- TypeORM 0.3.x with the `pg` driver
- class-validator / class-transformer
- @nestjs/config with environment validation
- @nestjs/swagger
- @nestjs/jwt (no passport; authentication is done in a middleware, see below)
- bcrypt for passwords, Node `crypto` (sha256, randomBytes, randomUUID) for tokens and keys
- @nestjs/terminus for health checks
- helmet, @nestjs/throttler
- Jest + supertest for tests
- Docker + Docker Compose

# Database Rules (very important)

- `synchronize: false` in EVERY environment. Never enable it, not even in tests.
- Every schema change (tables, columns, enums, indexes, constraints) goes through a
  TypeORM migration: generated with `migration:generate`, then reviewed and edited
  by hand if needed. Every migration must have a correct, complete `down()`.
- One shared DataSource file (e.g. `src/database/data-source.ts`) used by both the
  app and the TypeORM CLI.
- npm scripts: `migration:generate`, `migration:create`, `migration:run`,
  `migration:revert`, `migration:show`, `seed`.
- Column names in the database are snake_case. Set them explicitly with
  `name:` in the decorators (no extra naming-strategy dependency).
- All timestamps are `timestamptz`.
- Demo data (admin, user, agent) is created by an idempotent seed script, NOT by
  migrations. Migrations describe structure only.

# Unified Response Format

Every response, success or error, uses the same envelope. Implement it with a
global interceptor (success) and a global exception filter (errors).

Success:
{
  "success": true,
  "data": <payload>,
  "meta": { "requestId": "<uuid>", "timestamp": "<ISO-8601>" }
}

For paginated lists, `meta` also contains: page, limit, total, totalPages.

Error:
{
  "success": false,
  "error": {
    "code": "<STABLE_CODE>",
    "message": "<human-readable message>",
    "details": [ { "field": "<name>", "message": "<reason>" } ]   // optional
  },
  "meta": { "requestId": "<uuid>", "timestamp": "<ISO-8601>", "path": "<url>" }
}

Error codes (fixed set, the frontend relies on them):
VALIDATION_ERROR (400), UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND (404),
CONFLICT (409), TOO_MANY_REQUESTS (429), INTERNAL_ERROR (500).

Rules:
- Validation errors from class-validator are mapped to `details` with field + message.
- PostgreSQL errors from TypeORM (QueryFailedError) are mapped:
  23505 unique_violation -> 409 CONFLICT, 23503 foreign_key_violation -> 409 CONFLICT,
  23514 check_violation -> 400 VALIDATION_ERROR.
- 500 errors never expose internal details or stack traces in the response.
  The full error is logged server-side together with the requestId.
- Exceptions thrown inside middleware must also produce this envelope.
- Successful DELETE endpoints return 200 with `{ "id": "<uuid>" }` (not 204),
  to keep the envelope consistent.
- Swagger must document this envelope for every endpoint (use generic wrapper
  decorators/schemas, not the raw payload only).

# Request ID

- A middleware runs first on every request.
- If the client sends `X-Request-Id` and it matches `^[A-Za-z0-9-]{1,64}$`, reuse it.
  Otherwise generate one with `crypto.randomUUID()`.
- Store it on the request, return it in the `X-Request-Id` response header,
  and include it in every response `meta` and every server log line for that request.

# Phases

## Phase 0: Project Foundation

- NestJS project scaffold with a clean modular folder structure. Propose the
  structure to me in your report.
- Global prefix `/api`.
- Configuration with @nestjs/config + validation schema. The app must FAIL TO START
  with a clear message if a required variable is missing or invalid.
  Provide `.env.example` with every variable documented. Never commit `.env`.
- Docker Compose with:
  - `db`: postgres:16 with a named volume and a healthcheck (pg_isready)
  - `api`: multi-stage Dockerfile, non-root user, starts only after `db` is healthy,
    runs pending migrations on startup and then starts the app
  - an api healthcheck using the health endpoint
- TypeORM setup following the Database Rules above (no entities yet is fine).
- `GET /api/health` (public) using @nestjs/terminus with a database ping.
- Global ValidationPipe: whitelist: true, forbidNonWhitelisted: true, transform: true.
- Request ID middleware, response envelope interceptor, global exception filter.
- helmet, CORS configured from env, `app.set('trust proxy', ...)` configured from env
  so `req.ip` is correct behind Docker/proxies.
- Graceful shutdown hooks enabled.
- Swagger at `/api/docs` with two security schemes declared:
  `bearer` (JWT) and `apiKey` (header `X-API-Key`).
- README section: how to run with Docker in at most 3 commands.

## Phase 1: Authentication Data Model

Create entities and ONE generated migration for these tables only:

users
- id               uuid PK (generated)
- email            varchar(255) NOT NULL UNIQUE. Always stored lowercase and trimmed.
                   Add CHECK (email = lower(email)).
- password_hash    varchar(255) NULL (NULL for agents, which never log in with a password)
- name             varchar(100) NOT NULL
- role             postgres enum `user_role` ('admin', 'user', 'agent') NOT NULL DEFAULT 'user'
- is_active        boolean NOT NULL DEFAULT true
- created_at       timestamptz NOT NULL DEFAULT now()
- updated_at       timestamptz NOT NULL DEFAULT now()
- CHECK: role = 'agent' OR password_hash IS NOT NULL

sessions
- id                  uuid PK (this is the `sid` claim inside the access token)
- user_id             uuid NOT NULL FK -> users.id ON DELETE CASCADE, indexed
- refresh_token_hash  varchar(64) NOT NULL UNIQUE (sha256 hex)
- user_agent          varchar(512) NULL
- ip_address          varchar(45) NULL
- expires_at          timestamptz NOT NULL
- revoked_at          timestamptz NULL
- last_used_at        timestamptz NULL
- created_at          timestamptz NOT NULL DEFAULT now()

api_keys
- id            uuid PK
- user_id       uuid NOT NULL FK -> users.id ON DELETE CASCADE, indexed
- name          varchar(100) NOT NULL
- key_prefix    varchar(16) NOT NULL (shown to humans to identify a key, never the full key)
- key_hash      varchar(64) NOT NULL UNIQUE (sha256 hex of the full key)
- expires_at    timestamptz NULL
- revoked_at    timestamptz NULL
- last_used_at  timestamptz NULL
- created_at    timestamptz NOT NULL DEFAULT now()

Seed script (`npm run seed`), idempotent (running it twice creates no duplicates):
- One admin and one normal user. Emails and passwords read from env (SEED_*).
- One agent user (role 'agent', no password) and one API key for it.
- The raw API key is printed to the console ONLY when it is newly created.
  If the agent already has an active key, print a notice instead of creating another.
- API key format: `pmk_<prefix>_<secret>`, where the secret comes from
  `crypto.randomBytes(32)` encoded as base64url. Only the sha256 hash and the
  prefix are stored.

Verification I expect to be able to do: run the migration, inspect the tables
and constraints in psql, revert it, and run it again with no errors.

## Phase 2: Authentication (Middleware Level)

Token design:
- Access token: JWT, HS256 only (pin the algorithm on verify), TTL from env
  (default 15m). Claims: sub (user id), sid (session id), role, plus iss and aud
  from env, verified on every request.
- Refresh token: opaque, NOT a JWT. Format `<sessionId>.<secret>`, where the
  secret comes from `crypto.randomBytes(32)` base64url. Only sha256(secret) is
  stored, in sessions.refresh_token_hash. TTL from env (default 7 days).

Endpoints (module `auth`):
- POST /api/auth/register (public): creates a user with role 'user' ONLY.
  Sending a `role` field must be rejected by validation (forbidNonWhitelisted).
  Password: min 8 characters, at least one letter and one digit.
- POST /api/auth/login (public): returns accessToken, refreshToken,
  accessTokenExpiresIn, and the user (without the password hash).
  Same generic error for wrong email, wrong password, inactive user,
  or an agent account: 401 "Invalid credentials". When the user does not exist,
  still run a bcrypt compare against a dummy hash to avoid timing differences.
  Creates a session that stores user_agent and ip_address.
- POST /api/auth/refresh (public): body { refreshToken }.
  Parse the sessionId from the token and load the session.
  - If the session is not found, revoked, or expired: 401.
  - If the session is valid but the hash does not match: this is refresh-token
    REUSE. Revoke the session and return 401.
  - Otherwise ROTATE: generate a new refresh secret, store its hash, update
    last_used_at, and return a new token pair. Do the check and the update in a
    single transaction so two parallel refreshes cannot both succeed.
- POST /api/auth/logout (admin, user): revokes the current session.
- POST /api/auth/logout-all (admin, user): revokes all sessions of the current user.
- GET /api/auth/me (admin, user, agent): returns the current principal.
- Rate limit login, register, and refresh with @nestjs/throttler (limits from env).

AuthenticationMiddleware (applied to all routes):
- Its ONLY job is to answer "who are you?". It never decides permissions.
- No credentials at all: continue without `req.user`. Guards decide later.
- Both `Authorization: Bearer` and `X-API-Key` present: 401 (ambiguous).
- Bearer token: verify signature, algorithm, expiry, iss, and aud. Load the session
  (by sid) together with its user. Reject with 401 if the session is missing,
  revoked, or expired, or if the user is inactive. Take the role from the DATABASE,
  not from the token, so role changes and deactivation apply immediately.
- X-API-Key: compute sha256 and look up api_keys by key_hash. Reject with 401 if
  the key is not found, revoked, or expired, if the user is inactive, or if the
  user's role is not 'agent'. Update last_used_at at most once every 5 minutes
  per key, to avoid a database write on every request.
- Invalid credentials ALWAYS produce 401 in the unified envelope, with a generic
  message that does not reveal which check failed.
- On success, set `req.user` to a typed principal:
  {
    id: string;
    email: string;
    role: 'admin' | 'user' | 'agent';
    actorType: 'user' | 'agent';   // 'agent' when role is agent
    authMethod: 'jwt' | 'api_key';
    sessionId?: string;            // jwt only
    apiKeyId?: string;             // api_key only
  }
  Extend the Express Request type properly. No `any`.

## Phase 3: Authorization (Guard Level)

- Decorators: @Public(), @Roles(...roles), @CurrentUser().
- Two global guards registered with APP_GUARD, in this order:
  1. AuthenticatedGuard: if the route is not @Public and `req.user` is missing -> 401.
  2. RolesGuard: if the route is not @Public:
     - FAIL-CLOSED: if the route has no @Roles metadata, deny with 403 and log a
       warning naming the route. Every protected route must declare its roles
       explicitly.
     - If `req.user.role` is not in the allowed roles -> 403 FORBIDDEN.
- Do NOT implement audit logging now. Structure RolesGuard so a denial hook can be
  added later in one place (for example a private method called on every denial).
  Denied attempts will be written to an audit_logs table in a later phase.
- Create a temporary `AuthzDemoModule`, loaded only when NODE_ENV=development,
  with these endpoints so I can test the role matrix manually:
  - GET  /api/authz-demo/public        @Public()
  - GET  /api/authz-demo/any           @Roles('admin','user','agent')
  - POST /api/authz-demo/admin-only    @Roles('admin')
  - POST /api/authz-demo/admin-agent   @Roles('admin','agent')
  - GET  /api/authz-demo/no-roles      (no decorator, must return 403: fail-closed proof)
  It will be deleted in a later phase.
- In your report, include a role matrix table: every route x
  (anonymous / user / admin / agent) -> expected status.

## Phase 4: E2E Tests for Auth

- Separate test database (its own name, configured through `.env.test`). Migrations
  run before the suite (never synchronize). Tables are truncated between tests.
- Commands: `npm run test` (unit) and `npm run test:e2e` (e2e). Document in the
  README how to run them with Docker.
- Required test cases (at minimum):
  - register: success; duplicate email -> 409; sending `role` -> 400; weak password -> 400
  - login: success; wrong password -> 401; unknown email -> 401; agent account -> 401
  - access token works on /auth/me; expired or tampered token -> 401
  - logout, then the same access token -> 401 (session revocation works)
  - logout-all revokes every session of the user
  - refresh rotation: the new pair works; the old refresh token -> 401 AND the
    session is revoked (reuse detection)
  - API key: valid -> /auth/me works with actorType 'agent'; revoked -> 401;
    garbage -> 401
  - both Bearer and X-API-Key headers sent -> 401
  - the full role matrix from Phase 3, including the fail-closed route
  - every response, success and error, follows the envelope and carries
    meta.requestId; a client-sent X-Request-Id is echoed back
- Tests must hit the real database through HTTP. Do not mock the auth layer in e2e tests.

# Start

Begin with Phase 0 only. Before writing code, show me the folder structure you
plan to create and the list of dependencies with one-line justifications. Wait
for my confirmation on that, then implement Phase 0 and stop with the report.
