# Discord Contract

## Purpose

Discord bot provides public price-change reports, personal price reports, and personal target-price watch notifications without adding website accounts.

Admin Discord webhook remains separate and is only for maintainer smoke / ops alerts.

## Current Behavior

Supported slash commands:

- `/bot help`: returns an ephemeral Traditional Chinese task guide covering target-price alerts, immediate reports, daily DM reports, public reports, and their DM / guild / permission boundaries.
- `/price-report now`: creates a recent price report in the command context. If the user has enabled daily report settings, the report inherits its filters and can inherit its window.
- `/price-report settings`: opens an ephemeral settings panel for daily DM price reports. Users can configure window, categories, content type, up to five OR keyword groups, Taipei send time, preview DM, enable, and disable.
- `/watch`: opens an ephemeral target-price watch manager. Users can add a watch from a PartsRadarTW product URL, `/products/<id>` URL, or product id; list watches in fixed recent-update order with pagination; edit target price; and confirm removal of one watch.
- `/public-report status/manage/test`: lets a server manager view, configure, and test public price reports for the current guild.

The bot daemon also scans due scheduled personal reports, pending public reports, and reached target-price watches.

## Public/Internal Contract

- Public reports are server-level broadcasts configured per guild and channel.
- Personal scheduled reports and target-price watch notifications are sent by DM.
- `/price-report now` may reply in the command context, but personal watch lists and target-price settings must stay ephemeral or DM-only.
- Price reports include price drops, price rises, and optionally new products, subject to configured filters and a fixed system limit of 50 listed items.
- Discord price display is TWD-only because the database `Currency` enum and current crawler source contract only permit TWD.
- Target-price watch notifications are sent when current price is less than or equal to the target price and currency matches.
- `/watch` and `watch:*` component IDs are compatibility wire names for target-price watch flows; internal TypeScript names should keep the target-price domain explicit.
- A successfully notified watch is not sent again until the user updates or recreates the watch.
- Same-user reached watches in one scan are combined into a digest; oversized digests are split into multiple embeds.
- Delivery results are written to Discord notification delivery logs for retry, dedupe, and ops visibility.
- Failed and rate-limited deliveries are classified at the Discord transport boundary and persist only `error_category`, HTTP status, and numeric provider error code; provider `message` / `errors` payloads are not forwarded.
- Operator feature flags can temporarily disable public reports, personal reports, or target-price watches without deleting commands, settings, watches, or delivery history. Disabled commands return a safe user-facing message.
- Public-report tests are one-shot previews: they do not advance scheduled delivery state and are not retried automatically. Scheduled public-report retry applies only to persisted scheduled deliveries, and newly enabled settings do not backfill earlier crawl runs.

## Security/Data Boundary

- The bot stores Discord user ids and necessary preferences only; it does not create website accounts or bind Discord users to website users.
- Messages must not include secrets, raw HTML, source purchase URLs, standalone iBuy tokens, DB/internal URLs, raw IPs, internal headers, crawler stack traces, or parse error raw content.
- Bot token and webhook URL must live only in untracked `.env` or deployment secrets.
- Commands that generate reports use cooldowns to reduce abuse.
- Public-report channel setup requires Discord channel permissions for sending messages and embeds; missing permissions must return a readable user-facing hint.
- User-facing failure text is selected from the structured category only. Legacy `error_message` values remain in historical audit rows but are never displayed or used to infer a category.

## Files Owned By This Area

- `apps/crawler/src/scripts/ops/discord-bot.ts`
- `apps/crawler/src/scripts/ops/discord-bot/**`
- `apps/crawler/tests/scripts/ops/discord-bot*.test.ts`
- `apps/crawler/tests/scripts/ops/discord-bot/**`
- `docs/technical/operations-runbook.md`
- `docs/technical/data-model.md`
- `docs/technical/deployment.md`

## Validation

- `pnpm test:discord`
- `pnpm test:all`
- `pnpm check`
- `pnpm e2e` for repo-wide public web smoke after refactor slices
- Manual Discord validation uses `pnpm ops:discord-bot -- --register-commands` or the `discord-bot` Compose profile with deployment secrets.
