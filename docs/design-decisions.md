# Design decisions

The significant technical choices, why they were made, and their trade-offs.
Database-specific decisions are in [database.md](database.md).

## 1. Stack

| Choice | Why | Trade-off |
| --- | --- | --- |
| **NestJS 12** (current stable) | Modules, DI, guards, pipes and interceptors map directly onto the requirements (auth layers, validation, uniform responses). Nest 12 packages are ESM-only; the app follows the official Nest 12 template and stays CommonJS (Node 24 loads ESM via `require(esm)`), so tooling stays simple | Jest needs `--experimental-vm-modules` (prints a warning) |
| **PostgreSQL 16** | Real constraints (CHECK, partial and expression indexes), row locks, triggers, jsonb for audit data | Needs a server (Docker makes that trivial) |
| **TypeORM 0.3** | Mature Nest integration; migrations generated from entities and then reviewed | Verbose; some things (expression index, trigger) must be hand-written in migrations |
| **class-validator** for DTOs *and* env | One validation style everywhere; no Joi | |
| **Jest + supertest** | e2e tests hit the real app and database over HTTP | Slower than mocks (≈10 s), but it tests what really runs |

## 2. Authentication: why two mechanisms

Humans and AI agents have different needs, so each gets the mechanism that fits it:

- **Humans: short-lived JWT + rotating refresh token, backed by a server-side session.**
  - The JWT (HS256, 15 min) carries `sub`, `sid`, `role`, `iss`, `aud`. Signature,
    algorithm (pinned to HS256: no `alg: none`, no algorithm confusion), expiry,
    issuer and audience are verified on every request.
  - **But a JWT alone cannot be revoked.** So every request also loads the
    session (`sid`) and the user. A logout, a "logout all devices" or a
    deactivation takes effect **immediately**, and the **role comes from the
    database**, not from the token. Cost: one indexed query per request, which
    is negligible here and worth the correctness.
  - The refresh token is **opaque** (`<sessionId>.<secret>`, 256-bit secret).
    Only `sha256(secret)` is stored, so a database leak does not leak usable
    tokens. A fast hash is fine because the secret is random and long; passwords
    use bcrypt.
  - **Rotation with reuse detection:** every refresh replaces the secret. If an
    old secret is presented again, someone has a copy, so the whole session is
    revoked. The check and the update run in one transaction with a row lock, so
    two parallel refreshes cannot both succeed (tested).
  - The session lifetime is absolute (7 days from login); refreshing does not
    extend it, so a stolen refresh token cannot keep a session alive forever.
- **Agents: API keys.** An MCP server or a script has no interactive login and no
  place to keep a refresh flow. A long random key (`pmk_<prefix>_<secret>`) is
  simple and revocable. Only the prefix and sha256 of the key are stored. The
  format is checked before any database access. Keys only work for users with
  role `agent`, and `last_used_at` is written at most every 5 minutes (one
  conditional `UPDATE`, no write per request).
- **Login hardening:** one generic "Invalid credentials" for unknown email, wrong
  password, inactive account and agent account; a bcrypt comparison also runs
  for unknown emails (timing); per-IP rate limiting on register, login and refresh.

Rejected alternatives: **session cookies** (CSRF handling, awkward for agents and
MCP); **pure stateless JWT** (no immediate logout or deactivation); **OAuth2/OIDC
provider** (correct for production SSO, far too much for this scope).

## 3. Authorization: middleware for identity, guards for permission

- `AuthenticationMiddleware` only answers **"who are you?"**. With no
  credentials the request continues anonymously; invalid credentials, or both a
  token and a key, give 401. It never decides permissions.
- Two global guards decide **"may you?"**: `AuthenticatedGuard` (non-public route
  → must be authenticated, else 401) then `RolesGuard` (role must be listed, else 403).
- **Fail-closed:** a protected route without `@Roles` is denied and logged. A
  forgotten decorator can never open a route (there is a test route that proves it).
- **No role hierarchy.** Each route lists every allowed role (`super_admin` is
  written next to `admin` wherever it applies). It is a bit more verbose, but the
  permissions of any route can be read in one place, and the role matrix test
  checks every route × role.
- **Least privilege for agents:** read products and categories; write only
  categories and category↔product links (the MCP scope); no product writes, no
  user management, no audit access.
- **super_admin:** everything an admin can do, plus account management. Exactly
  one exists (DB-enforced) and it can't be deactivated, so there is no lockout.

## 4. Audit log

- Written for every write (catalog, links, account management, register, login,
  logout, refresh-token reuse) and every **denied** attempt (403). It records:
  action, outcome, timestamp, resource type and id, actor (id, type, email and
  role snapshots, auth method), request id, IP, and what changed (a snapshot for
  create/delete; `{ field: { from, to } }` for updates; added/removed ids for links).
- **Accuracy:** the audit row is inserted **in the same transaction** as the change,
  so the log can't claim something that was rolled back, and a change can't
  commit without its log entry. No-op updates write no row.
- **Tamper resistance:** a database trigger rejects `UPDATE`/`DELETE` on
  `audit_logs`. The API only offers a read endpoint (super_admin, admin).
- Trade-off: anonymous 401s are not audited (they never reach the roles guard);
  they would mostly be noise. Failed logins are handled by rate limiting, not the
  audit log.

## 5. API design

- Resource-oriented REST under `/api`; category↔product links are a
  sub-resource (`/categories/:id/products`: add, replace, remove one), because
  managing those links is a core agent task.
- **One response envelope** for everything, including errors from middleware,
  unknown routes (also outside `/api`), malformed JSON and the throttler. There
  is a fixed set of error codes; 500s never expose internals and are logged with
  the request id. Two codes were added to the original set: `SERVICE_UNAVAILABLE`
  (health check) and `BAD_REQUEST` (other 4xx).
- Validation: global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`
  (unknown fields → 400, e.g. `role` on register), `{ field, message }` details.
  Related ids are checked (unknown → 400 with the exact ids); DB constraints are
  the last line of defence.
- `DELETE` returns `200 { id }` (keeps the envelope). Lists are paginated
  (max 100) with a stable sort.
- Request ids (`X-Request-Id`) tie together response, logs and audit rows.

## 6. Reliability and operations

- Fail-fast configuration: the app and migration CLI refuse to start on a
  missing or invalid variable and list every problem.
- Docker: Postgres healthcheck → API starts after it, runs migrations (and the
  idempotent seed) → API healthcheck on `/api/health` (DB ping, 503 when down).
  The image is multi-stage and runs as a non-root user. `exec` in the entrypoint
  lets SIGTERM reach Node, so shutdown is graceful.
- Every multi-step write runs in a transaction; row locks serialize concurrent
  changes to the same row.
- The rate-limit store is in memory: correct for one instance. Several
  instances would need a shared store (Redis); that is a known limitation.

## 7. Known limitations / next steps

- MCP server (next phase): it will call this REST API with the agent API key, so
  validation, authorization and auditing apply unchanged.
- No API key management endpoints yet (keys come from the seed).
- `authz-demo` routes exist only in development and are scheduled for removal.
- Password policy counts characters; bcrypt's real limit is 72 **bytes**.
