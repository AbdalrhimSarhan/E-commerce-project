# syntax=docker/dockerfile:1

# ---------- base: shared Node image ----------
FROM node:24-bookworm-slim AS base
WORKDIR /app

# ---------- deps: all dependencies (needed to build) ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build: compile TypeScript to dist/ ----------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---------- prod-deps: runtime dependencies only ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- runtime: small image, non-root user ----------
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh

# The script may have been saved on Windows: strip CRLF line endings and set the
# exec bit. It is also started through `sh`, so it never depends on the exec bit.
RUN sed -i 's/\r$//' ./docker/entrypoint.sh && chmod +x ./docker/entrypoint.sh

# The official image ships a non-root "node" user.
USER node

EXPOSE 3000
ENTRYPOINT ["sh", "./docker/entrypoint.sh"]
