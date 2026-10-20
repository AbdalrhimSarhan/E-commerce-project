# AI-assisted development report

> This English report is the official one. An Arabic account of the
> engineering process, in the developer's own words, is in
> [engineering-process.ar.md](engineering-process.ar.md).

## 1. Tools

- **Claude Code** (CLI, in VS Code), as the coding agent: it read and wrote
  files, ran builds, tests, Docker and psql, and reported back.
- The developer: architecture and design decisions, review, verification, every
  git commit. The agent never ran git commands.

## 2. Workflow

1. **A written specification first.** The developer wrote
   [`docs/prompt-1.md`](prompt-1.md): stack, database rules, response envelope,
   error codes, and five phases (0 foundation, 1 auth data model, 2
   authentication, 3 authorization, 4 e2e tests), with strict working rules:
   one phase at a time, no git by the agent, ask when something is ambiguous,
   strict TypeScript without `any`, never edit a migration that has run, and a
   written report per phase.
2. **Plan before code.** For each phase the agent first proposed the folder
   structure, the dependencies (with a reason for each) and its open questions.
   Implementation started only after approval.
3. **Verifiable steps and approval gates.** Phases 0 and 1 were implemented
   step by step, each step verified and stopped for review, and each phase
   ended with an explicit "APPROVED phase N" gate. Every phase ended with a
   report in [`docs/reports/`](reports/) (summary, files, decisions not in the
   prompt, verification commands, an empty "My Review" section).
4. **Design changes go back to the agent as written decisions.** After Phase 0,
   the developer added: a `super_admin` role, "users are never deleted",
   account-management endpoints, seed-on-startup, and a deterministic dev agent
   key. The agent applied them and recorded them in the phase plans.
5. **Final phases.** After Phase 1 was approved, the developer asked the agent
   to build the remaining API phases and the catalog/audit features in one run.
   The MCP server was then built in a final phase from a separate written
   prompt, and the developer tested it manually with MCP Inspector and with a
   real AI client in VS Code.

## 3. Context and tasks given to the agent

- The assessment text (`backend-task.md`) as context only, and `docs/prompt-1.md`
  as the source of truth ("where this prompt is more specific, follow it").
- Decisions given as explicit choices when the agent asked, for example:
  - the health-check 503 code (→ add `SERVICE_UNAVAILABLE`)
  - env validation with class-validator instead of Joi
  - logging with Nest's logger + AsyncLocalStorage instead of pino
  - NestJS 12 (ESM packages) instead of staying on 11
  - three stricter DB constraints (normalized email, agents never have a
    password, a single super_admin)
  - the semantics of the fixed agent key
  - a generic `BAD_REQUEST` code for other 4xx
  - host port 5433 (5432 is used by a local PostgreSQL/pgAdmin)

## 4. Delegated to the AI (as a programmer) vs. decided by the developer

| Delegated to the agent | Retained by the developer |
| --- | --- |
| Writing entities, DTOs, services, controllers, guards, middleware | The overall architecture and phase plan; what is in or out of scope |
| Generating migrations and reviewing the SQL | The database rules (migrations only, snake_case, `timestamptz`, constraints in the DB) |
| Writing unit and e2e tests | The auth model: JWT + server-side sessions, opaque rotating refresh tokens, API keys for agents, middleware/guard split, fail-closed roles |
| Docker / Compose / entrypoint mechanics | The roles and permissions (super_admin, least privilege for agents), "never delete users" |
| Documentation drafts (README, ERD, reports) | The response envelope and error-code contract |
| Proposing options with trade-offs when something was ambiguous | Choosing between those options; approving each phase; every commit |

I designed the data model in a planning session before any code and challenged
several proposals: I removed `slug` from categories, and removed `created_by`
from the link table and a "source" column from the audit log as redundant. I
chose many-to-many for a clean agent permission boundary, made users never
deleted with an audit FK `ON DELETE RESTRICT`, added `super_admin`, restricted
the audit log to `super_admin` (separation of duties), chose key passthrough for
the MCP server, and kept UUIDs instead of switching to sequential ids.

## 5. How the generated code was reviewed and validated

- **Automated checks on every step:** `npm run build`, `npm run lint`
  (typescript-eslint strict type-checked rules; `no-explicit-any` is an error),
  prettier, and `tsc --noEmit` including the tests.
- **Tests:** API: 100 unit tests and 220 e2e tests over HTTP against a real
  database (no mocks in the auth layer). MCP server: 46 unit tests and 14 e2e
  tests with the real MCP client against the running stack. All of them are
  also runnable inside Docker.
- **Mutation check:** bugs were planted on purpose (agents allowed to create
  products; reuse detection no longer revoking the session). The suite caught
  both, which shows the tests check behaviour and not just coverage.
- **Database verification by hand:** for each migration, run → inspect in psql
  → try to violate every constraint → revert → run again → `migration:generate`
  must report "No changes" (no drift between entities and migrations).
- **Running system checks:** `docker compose up` from an empty volume,
  healthchecks, a DB-down test (503), graceful shutdown (exit 0), a smoke test of
  the production container.
- **Issues found during review and fixed** (examples):
  - Routes outside `/api` returned Express's HTML 404 → added an envelope 404.
  - The public health 503 leaked an internal hostname (`getaddrinfo ENOTFOUND db`)
    → it now returns only `down`.
  - Helmet's `upgrade-insecure-requests` would break Swagger over plain HTTP →
    disabled that one directive.
  - A local PostgreSQL on port 5432 made the host-side migration CLI talk to the
    wrong server → host port 5433.
  - TypeORM ignores `undefined` in `where`, so a session-less logout could have
    revoked *all* of a user's sessions → explicit guard in the service.
- **Manual review by the developer:** I reviewed each phase report and plan
  before approving it. I rejected a plan of 9 tiny commits, and later a commit
  split where one commit did not build. I inspected the migration and the
  constraints in psql. I tested the MCP server myself in MCP Inspector: the 10
  tools, a duplicate-name `CONFLICT`, a wrong key (`UNAUTHORIZED`), and the
  resulting audit rows. I verified that the audit log is readable only by
  `super_admin`.

## 6. Lessons learned

- Never run commands while the agent is verifying: I once edited `.env` and ran
  builds during its seed checks, which broke the database password and deleted
  `dist` mid-test.
- A written spec with mandatory stops kept me in control of every decision.
- Agent output must be read, not trusted: the agent's tests were green, but my
  manual Inspector session was what proved the system works end to end.
- Under deadline pressure I merged late work into fewer commits; small,
  verifiable commits are the practice I follow when time allows.

## 7. MCP server

- **TypeScript SDK v2** (`@modelcontextprotocol/server`, `@modelcontextprotocol/node`),
  serving the 2026-07-28 protocol revision and the 2025 revision on one endpoint.
- **Streamable HTTP**, stateless, at `POST /mcp`.
- **A pure API client:** it never touches the database and imports no API code;
  every tool is an HTTP call to the REST API, so validation, permissions, business
  rules and the audit log cannot be bypassed.
- **Key passthrough:** the MCP client sends the agent API key on every request
  and the server forwards it to the API; the MCP server stores no secret.
- **No product write tools**, because the agent role has no permission to change
  products: 4 read tools and 6 category tools.
- **Tests:** 46 unit tests and 14 e2e tests.

Details: [mcp-tools.md](mcp-tools.md) and section 7 of
[design-decisions.md](design-decisions.md).
