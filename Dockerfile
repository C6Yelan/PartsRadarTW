# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

RUN mkdir -p /var/lib/partsradar/snapshots /var/lib/partsradar/product-images \
  && chown -R node:node /var/lib/partsradar

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/crawler/package.json apps/crawler/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN DATABASE_URL="postgresql://partsradar:partsradar@localhost:5432/partsradar?schema=public" pnpm db:generate

FROM base AS web-build

ENV NODE_ENV=production

RUN pnpm build:web

FROM web-build AS web

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER node

EXPOSE 3000

CMD ["pnpm", "--filter", "@partsradar/web", "start"]

FROM base AS crawler

ENV NODE_ENV=production

USER node

# Keep the generic crawler image safe by default. Compose profiles provide the
# scheduled daemon and manual tooling commands explicitly.
CMD ["pnpm", "--filter", "@partsradar/crawler", "manual:crawl-coolpc-once", "--", "--help"]

FROM base AS migrate

ENV NODE_ENV=production

USER node

CMD ["pnpm", "db:deploy"]
