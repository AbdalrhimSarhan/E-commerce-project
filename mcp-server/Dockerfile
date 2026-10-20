# syntax=docker/dockerfile:1

# ---------- base ----------
FROM node:24-bookworm-slim AS base
WORKDIR /app

# ---------- deps: all dependencies (build + tests) ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build: TypeScript -> dist/ ----------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- prod-deps: runtime dependencies only ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- runtime: small image, non-root ----------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3001
# exec form: SIGTERM reaches Node directly (graceful shutdown).
CMD ["node", "dist/main.js"]

# ---------- test: sources + dev deps, for `docker compose --profile test run --rm mcp-e2e` ----------
FROM deps AS test
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
USER node
CMD ["npm", "run", "test:e2e"]
