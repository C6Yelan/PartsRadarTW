# Ops Contract

## Purpose

Ops surfaces help maintainers detect public availability issues, crawler/data-flow drift, image/link health problems, raw snapshot retention drift, and Discord delivery failures without exposing internal state to users.

## Current Behavior

- `production-smoke` checks public routes/APIs and, when DB access is available, deployment-internal data health.
- `smoke-daemon` runs production smoke on a schedule and writes safe summaries to container logs.
- Admin Discord webhook sends maintainer-only `WARN`, `FAIL`, and `RECOVERED` summaries from smoke results.
- `ops-web` serves the protected `/ops/status` page from the same web image under a separate Compose profile.
- External monitoring is public-only and should use homepage, public APIs, and `production-smoke --public-only`; DB-backed and Discord delivery signals stay internal.

## Public/Internal Contract

- Public `web` must keep `OPS_STATUS_ENABLED=false`; `/ops/status` on the public service should return `404`.
- `ops-web` may enable `/ops/status` only on private network, localhost, VPN, or SSH tunnel access.
- `/ops/status` requires `OPS_STATUS_TOKEN` by header or query token.
- Production smoke must not live-fetch CoolPC or mutate product data.
- Public-only smoke must not require DB access.
- DB-backed smoke and ops status may read aggregate crawler, product image, link health, raw snapshot, and Discord delivery state.
- Admin webhook must send only safe, summarized status and must not become a user notification channel.

## Security/Data Boundary

Ops surfaces must not expose:

- raw HTML or raw snapshot content;
- parse error raw content;
- crawler stack traces;
- DB URL, env values, tokens, or private connection strings;
- raw IPs or internal request headers;
- Discord user ids;
- product ids in ops summaries unless a specific authenticated maintainer workflow explicitly needs them;
- Discord delivery raw error messages.

`OPS_STATUS_TOKEN`, Discord webhook URL, bot token, DB credentials, Cloudflare tunnel token, and deployment secrets must remain outside Git.

## Files Owned By This Area

- `apps/crawler/src/scripts/ops/production-smoke.ts`
- `apps/crawler/src/scripts/ops/production-smoke/**`
- `apps/crawler/src/scripts/ops/production-smoke-daemon.ts`
- `apps/crawler/src/scripts/ops/smoke-discord-notification.ts`
- `apps/crawler/src/scripts/ops/smoke-discord-notification/**`
- `apps/web/app/ops/status/**`
- `docs/technical/operations-runbook.md`
- `docs/technical/external-monitoring.md`
- `docs/technical/deployment.md`
- `docs/technical/security.md`

## Validation

- `pnpm test:ops`
- `pnpm test:all`
- `pnpm check`
- `pnpm ops:production-smoke -- --public-only --base-url <public-url>`
- `docker compose config`
- `docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler config`
- `docker compose -f compose.yml -f compose.ops.yml --profile ops config`
- `docker compose -f compose.yml -f compose.ops.yml --profile discord-bot config`
- `pnpm e2e` for repo-wide public web smoke after refactor slices
