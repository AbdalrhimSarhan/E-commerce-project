# AI-assisted development report

> **Draft.** Written from the actual development session. Sections marked
> **[to complete]** are for the developer to fill in or correct before submission.

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
3. **Small, verifiable commits.** Each unit of work was implemented and verified,
   then stopped for review; the developer committed it. Each phase ended with a
   report in [`docs/reports/`](reports/) (summary, files, decisions not in the
   prompt, verification commands, an empty "My Review" section) and an explicit
   "APPROVED phase N" gate.
4. **Design changes go back to the agent as written decisions.** After Phase 0,
   the developer added: a `super_admin` role, "users are never deleted",
   account-management endpoints, seed-on-startup, and a deterministic dev agent
   key. The agent applied them and recorded them in the phase plans.
5. **Final run.** After Phase 1 was approved, the developer asked the agent to
   build the remaining phases and the catalog/audit features in one run, and to
   stop before the MCP server, which will be built together.

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

**[to complete]** Anything else you decided or changed yourself.

## 5. How the generated code was reviewed and validated

- **Automated checks on every step:** `npm run build`, `npm run lint`
  (typescript-eslint strict type-checked rules; `no-explicit-any` is an error),
  prettier, and `tsc --noEmit` including the tests.
- **Tests:** 87 unit tests and 206 e2e tests over HTTP against a real database
  (no mocks in the auth layer), also runnable inside Docker.
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
- **Manual review by the developer:** **[to complete]** what you reviewed line by
  line, what you changed, what you rejected.

## 6. Lessons learned

**[to complete]**, e.g.:
- A precise written spec plus "ask instead of assuming" removed most rework.
- Requiring a report with "decisions not in the prompt" made hidden assumptions visible.
- Generated tests must be checked for strength (mutation check), not only for being green.
