# External Monitoring

This document defines the first external monitoring slice. It covers public availability and keeps DB-backed or personal Discord bot signals inside `smoke-daemon`, admin webhook, and protected `ops-web`.

## Scope

Monitor these public checks:

| Check | Target | Expected |
| --- | --- | --- |
| Homepage | `GET /` | `HTTP 200` |
| Source status | `GET /api/source-status` | `HTTP 200`, JSON has `status` |
| Categories | `GET /api/categories` | `HTTP 200`, JSON has non-empty `data` |
| Products | `GET /api/products?pageSize=1` | `HTTP 200`, JSON has `data` and `pagination` |
| Build list | `GET /build-list` | `HTTP 200` |
| Public smoke | `pnpm monitor:public-smoke --base-url https://partsradar.net` | exit code `0` |

Product detail, price-history, and image API checks need a real product id. Prefer using `production-smoke --public-only` for those because it samples from the product list and skips DB access.

Do not expose or monitor these publicly:

- `/ops/status`
- PostgreSQL
- crawler, maintenance, cleanup, or Discord bot containers
- raw snapshot storage
- Discord user ids, delivery error messages, or personal notification settings

## Uptime Kuma Baseline

Create HTTP monitors:

- `PartsRadarTW homepage`: `https://partsradar.net/`
- `PartsRadarTW source-status`: `https://partsradar.net/api/source-status`
- `PartsRadarTW categories`: `https://partsradar.net/api/categories`
- `PartsRadarTW products`: `https://partsradar.net/api/products?pageSize=1`
- `PartsRadarTW build-list`: `https://partsradar.net/build-list`

Recommended first-pass settings:

- Interval: `60s`
- Retries: `2`
- Retry interval: `30s`
- Accepted status: `200`
- Alert only after retries fail

For deeper public checks, use a script monitor or host cron:

```bash
pnpm monitor:public-smoke --base-url https://partsradar.net
```

That command checks homepage, build-list, source-status, categories, products, product detail, sampled product images, price history, rate-limit headers, and source freshness without DB access.

## Cloudflare Monitoring Baseline

Cloudflare should remain the public edge. Use it for:

- HTTP uptime check for `/`
- HTTP uptime check for `/api/source-status`
- WAF / security events review
- Basic bot / high-rate request observation before changing app limits

Do not route `ops-web` through the public tunnel. If an external tool must read `/ops/status`, access it through VPN, SSH tunnel, or private network and include `OPS_STATUS_TOKEN`.

## Alert Routing

- Public HTTP monitors alert only on public availability failures.
- `smoke-daemon` admin webhook alerts on DB-backed or deployment-internal warnings and failures.
- Discord bot delivery `FAILED` / `RATE_LIMITED` aggregation stays internal via `smoke-daemon` and `ops-web`.
- Avoid sending both Uptime Kuma and admin webhook to the same noisy channel without cooldown.

## First Response

When a public monitor fails:

1. Check whether `pnpm monitor:public-smoke --base-url https://partsradar.net` also fails.
2. If only the public monitor fails, inspect Cloudflare Tunnel and DNS.
3. If public smoke fails on app routes, inspect `web` logs and `smoke-daemon` summary.
4. If source freshness is stale but routes are up, inspect `crawler-daemon` and recent crawl runs.
