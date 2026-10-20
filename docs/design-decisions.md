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
- **Seeded data is not audited.** The seed loads initial data (accounts and the
  demo catalog); it is not an action by a user or an agent, so it writes no audit
  rows, and the audit log only ever describes what real actors did.

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

## 7. MCP server

Tool reference: [mcp-tools.md](mcp-tools.md).

### 7.1 The MCP server is an API client, not a second backend
The MCP server never connects to the database and imports no code from `src/`
(it is a separate package in `mcp-server/`). Every tool is one HTTP call to the
REST API. So:
- authentication, role checks, validation, business rules, transactions and
  the audit log are enforced **in one place** (the API), for humans and agents alike;
- the MCP server **cannot bypass** them: there is no code path around the API;
- the two can be deployed and scaled separately, and the API stays the single source of truth.

Trade-off: one extra network hop per tool call (a few ms locally), and the API's
error envelope must be mapped. Both are cheap compared with duplicating the
business rules.

### 7.2 SDK v2 and the 2026-07-28 revision
The server uses the TypeScript SDK **v2** (`@modelcontextprotocol/server`,
`@modelcontextprotocol/node`), the current stable line, released with the
2026-07-28 spec. `createMcpHandler` serves **2026-07-28** (stateless, per-request
`_meta` envelope) and, through its default `legacy: 'stateless'` fallback,
**2025** clients (`initialize` handshake) on the same URL. Current clients (VS
Code, MCP Inspector) and new ones both work; the e2e tests connect in both eras.
v1 (`@modelcontextprotocol/sdk`) was not used.

### 7.3 Streamable HTTP, stateless
Streamable HTTP is the standard remote transport (stdio would only work for a
local child process, not for a Docker service). The server is **stateless**:
every request gets a fresh server instance from the factory, bound to that
request's key. There are no sessions to store, expire or share between replicas,
so the MCP server can scale horizontally behind a load balancer.

### 7.4 Key passthrough (no secret in the MCP server)
The MCP client sends the agent's API key on every request (`X-API-Key`, or
`Authorization: Bearer` for clients that only support that). The MCP server
hands it to the per-request API client, which forwards it as `X-API-Key`. The
**API** decides who the caller is and what it may do.
- The MCP server stores no credential: a compromised MCP container leaks
  nothing at rest, and there is one place to revoke access (the API).
- Each request is isolated: a tool can only ever use the key of the request
  that called it (closure over a per-request client, no global state).
- The key is never logged; a redaction filter is a second safeguard (tested).
- No key → HTTP 401 before MCP handling; a bad, revoked or expired key, or a
  deactivated agent → the API's 401, returned as tool error `UNAUTHORIZED`.

**Why an API key and not a JWT for agents?** An API key is long-lived, which is
its risk. But it is stored only as a sha256 hash, can be revoked or expired at
any time, works only for the `agent` role (least privilege: no product writes,
no user management, no audit access), and stops working immediately when the
agent is deactivated. A JWT would need an interactive login plus a refresh flow
that an MCP client cannot run. A full OAuth 2.1 setup (which the MCP spec
supports) is the production upgrade path, but it is far beyond this scope.

### 7.5 No product write tools
The agent role may not create, update or delete products (API rule). Exposing
such tools would only produce `FORBIDDEN` errors, mislead the model about what
it can do, and waste context, so they are not registered at all (least
privilege; tested in e2e: `tools/list` returns exactly 10 tools).

### 7.6 Error mapping
Every API error envelope becomes a tool result with `isError: true` and
`structuredContent.error = { code, message, details?, requestId }`, using the
**API's own code** (`VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
...). The agent can read *why* a call failed and react (e.g. pick another name
after `CONFLICT`). Network failures and timeouts become `UPSTREAM_UNAVAILABLE`
without stack traces or internal addresses. Successful results carry a short
text summary plus the JSON as `structuredContent`. The `requestId` of each tool
call is sent as `X-Request-Id`, so one id links the MCP log line, the API log
and the audit row.

## 8. Known limitations / next steps

- No API key management endpoints yet (keys come from the seed).
- MCP: no OAuth 2.1 authorization server (key passthrough instead, see 7.4).
- `authz-demo` routes exist only in development and are scheduled for removal.
- Password policy counts characters; bcrypt's real limit is 72 **bytes**.
