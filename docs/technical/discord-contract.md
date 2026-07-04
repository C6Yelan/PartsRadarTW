# Discord Contract

## Purpose

Discord bot provides public price-change reports, personal price reports, and personal target-price watch notifications without adding website accounts.

Admin Discord webhook remains separate and is only for maintainer smoke / ops alerts.

## Current Behavior

Supported slash commands:

- `/bot help`: returns an ephemeral Traditional Chinese help embed.
- `/price-report now`: creates a recent price report in the command context. If the user has enabled daily report settings, omitted options can inherit those settings.
- `/price-report settings`: opens an ephemeral settings panel for daily DM reports. Users can configure window, categories, content type, keyword, max items, Taipei send time, preview DM, enable, and disable.
- `/watch`: opens an ephemeral target-price watch manager. Users can add a watch from a PartsRadarTW product URL, `/products/<id>` URL, or product id; edit target price; remove one watch; batch remove watches; filter and sort their active watch list.
- `/public-report status/manage/test`: lets a server manager view, configure, and test public price reports for the current guild.

The bot daemon also scans due scheduled personal reports, pending public reports, and reached target-price watches.

## Public/Internal Contract

- Public reports are server-level broadcasts configured per guild and channel.
- Personal scheduled reports and target-price watch notifications are sent by DM.
- `/price-report now` may reply in the command context, but personal watch lists and target-price settings must stay ephemeral or DM-only.
- Price reports include price drops, price rises, and new products, subject to configured filters and item limits.
- Target-price watch notifications are sent when current price is less than or equal to the target price and currency matches.
- A successfully notified watch is not sent again until the user updates or recreates the watch.
- Same-user reached watches in one scan are combined into a digest; oversized digests are split into multiple embeds.
- Delivery results are written to Discord notification delivery logs for retry, dedupe, and ops visibility.
- Operator feature flags can temporarily disable public reports, personal reports, or target-price watches without deleting commands, settings, watches, or delivery history. Disabled commands return a safe user-facing message.

## Security/Data Boundary

- The bot stores Discord user ids and necessary preferences only; it does not create website accounts or bind Discord users to website users.
- Messages must not include secrets, raw HTML, source purchase URLs, standalone iBuy tokens, DB/internal URLs, raw IPs, internal headers, crawler stack traces, or parse error raw content.
- Bot token and webhook URL must live only in untracked `.env` or deployment secrets.
- Commands that generate reports use cooldowns to reduce abuse.
- Public-report channel setup requires Discord channel permissions for sending messages and embeds; missing permissions must return a readable user-facing hint.

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
