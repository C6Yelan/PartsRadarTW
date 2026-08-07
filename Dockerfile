# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV COREPACK_HOME="/corepack"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "$COREPACK_HOME" \
  && corepack enable \
  && corepack prepare pnpm@11.3.0 --activate \
  && chmod -R a+rX "$COREPACK_HOME"

ENV COREPACK_ENABLE_NETWORK=0

RUN mkdir -p /var/lib/partsradar/snapshots /var/lib/partsradar/product-images \
  && chown -R node:node /var/lib/partsradar

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/crawler/package.json apps/crawler/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --fetch-timeout=600000

COPY . .

RUN DATABASE_URL=unused pnpm db:generate

FROM base AS web-build

ARG CSP_MODE=enforce
ARG CSP_REPORT_URI=""

ENV NODE_ENV=production \
  CSP_MODE=$CSP_MODE \
  CSP_REPORT_URI=$CSP_REPORT_URI

RUN pnpm build:web

FROM base AS crawler-deploy

RUN pnpm --config.node-linker=hoisted --config.auto-install-peers=false \
  --filter @partsradar/crawler deploy --prod --legacy /prod/crawler \
  && cd /prod/crawler \
  && DATABASE_URL=unused \
  /app/packages/db/node_modules/.bin/prisma generate \
  --schema node_modules/@partsradar/db/prisma/schema.prisma

FROM base AS migrate-deploy

RUN pnpm --config.node-linker=hoisted --config.auto-install-peers=false \
  --filter @partsradar/db deploy --legacy /prod/migrate \
  && cd /prod/migrate \
  && DATABASE_URL=unused \
  /app/packages/db/node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

FROM runtime AS web

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public

RUN mkdir -p /app/apps/web/.next/cache \
  && chown -R node:node /app/apps/web/.next/cache

USER node

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

FROM runtime AS crawler

ENV NODE_ENV=production

WORKDIR /app

RUN mkdir -p /var/lib/partsradar/snapshots /var/lib/partsradar/product-images \
  && chown -R node:node /var/lib/partsradar

COPY --from=crawler-deploy --chown=node:node /prod/crawler ./
COPY --from=base --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER node

CMD ["node", "--import", "tsx", "src/scripts/manual/crawl-coolpc-once.ts", "--help"]

FROM runtime AS migrate

ENV NODE_ENV=production

WORKDIR /app

COPY --from=migrate-deploy --chown=node:node /prod/migrate ./

USER node

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node --import tsx prisma/configure-runtime-role.ts"]
