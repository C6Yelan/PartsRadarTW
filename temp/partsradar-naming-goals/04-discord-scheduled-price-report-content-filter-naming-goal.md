# Goal 4 — Discord scheduled price-report and content-filter naming

## Title

Discord scheduled price-report and content-filter naming

## Goal

Normalize Discord price-report internal names so scheduled report actions and report content filters are not confused with daily-only behavior or Discord events.

## Scope

Apply to Discord bot internal TypeScript names, parser action names, tests, and docs while preserving Discord and DB contracts.

Primary scope:

* `apps/crawler/src/scripts/ops/discord-bot/types/price-report.ts`
* `apps/crawler/src/scripts/ops/discord-bot/types/public-report.ts`
* `apps/crawler/src/scripts/ops/discord-bot/commands/ids.ts`
* `apps/crawler/src/scripts/ops/discord-bot/commands/price-report-components.ts`
* `apps/crawler/src/scripts/ops/discord-bot/commands/public-report-components.ts`
* `apps/crawler/src/scripts/ops/discord-bot/interactions/price-report-handler.ts`
* `apps/crawler/src/scripts/ops/discord-bot/interactions/price-report-settings.ts`
* `apps/crawler/src/scripts/ops/discord-bot/interactions/public-report-handler.ts`
* `apps/crawler/src/scripts/ops/discord-bot/interactions/modal-submit.ts`
* `apps/crawler/src/scripts/ops/discord-bot/price-report/settings.ts`
* `apps/crawler/src/scripts/ops/discord-bot/price-report/filters.ts`
* `apps/crawler/src/scripts/ops/discord-bot/public-price-report/**`
* Discord price-report tests and support clients
* `docs/technical/discord-contract.md`
* `.env.example` comments that describe Discord price-report behavior

Out of scope:

* Changing slash command names
* Changing Discord `custom_id` string literals without aliases
* Changing DB enum values, model names, or migration history
* Adding non-daily interval features
* Changing notification behavior

## Naming problems to resolve

* `enableDailyPriceReport` and parsed action names such as `enable_daily_report` imply the whole feature is only a daily report, while the persisted domain also uses scheduled report concepts.
* If the implementation still only enables `DAILY`, names should say “daily scheduled report” rather than imply a new interval feature.
* `event` / `events` names in price-report filters represent included report content types: price drops, price rises, and new products. They are not Discord events.
* Constants such as `PRICE_REPORT_EVENT_PRICE_DROPS_VALUE` and functions such as `formatPriceReportEventFilterLabel` should use content/change-filter terminology.
* Similar public-report names should use the same terminology to avoid drift.

## Rename strategy

Use these terms consistently:

* `scheduledPriceReport`: the scheduled private price report domain.
* `dailyScheduledPriceReport`: only when the code still forces interval `DAILY`.
* `reportContentFilter` or `priceReportContentFilter`: selected report content types.
* `priceChangeType` only when a value specifically means price drop or price rise, not new products.

Recommended renames:

* `enableDailyPriceReport` → `enableDailyScheduledPriceReport`, unless Codex finds full interval support already exists; only then use `enableScheduledPriceReport`.
* `enable_daily_report` parsed action → `enable_daily_scheduled_report` or `enable_scheduled_report`, matching the function decision above.
* `disable_daily_report` parsed action → matching scheduled-report wording.
* `formatPriceReportEventFilterLabel` → `formatPriceReportContentFilterLabel`.
* `PRICE_REPORT_EVENT_PRICE_DROPS_VALUE` → `PRICE_REPORT_CONTENT_PRICE_DROPS_VALUE`.
* `PRICE_REPORT_EVENT_PRICE_RISES_VALUE` → `PRICE_REPORT_CONTENT_PRICE_RISES_VALUE`.
* `PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE` → `PRICE_REPORT_CONTENT_NEW_PRODUCTS_VALUE`.
* `PUBLIC_REPORT_EVENTS_CUSTOM_ID` internal constant name → `PUBLIC_REPORT_CONTENT_FILTER_CUSTOM_ID`, while preserving the string value unless an alias parser is added.

Keep existing Discord string values as compatibility wire values unless a parser accepts both old and new values.

## Files / domains Codex must inspect first

* `apps/crawler/src/scripts/ops/discord-bot/commands/ids.ts`
* `apps/crawler/src/scripts/ops/discord-bot/types/price-report.ts`
* `apps/crawler/src/scripts/ops/discord-bot/types/public-report.ts`
* `apps/crawler/src/scripts/ops/discord-bot/price-report/settings.ts`
* `apps/crawler/src/scripts/ops/discord-bot/price-report/filters.ts`
* `apps/crawler/src/scripts/ops/discord-bot/commands/price-report-components.ts`
* `apps/crawler/src/scripts/ops/discord-bot/commands/public-report-components.ts`
* `apps/crawler/src/scripts/ops/discord-bot/interactions/**`
* `apps/crawler/tests/scripts/ops/discord-bot/**price-report**`
* `docs/technical/discord-contract.md`
* `.env.example`

## Required behavior preservation

* Existing Discord messages with old `custom_id` values must continue to parse.
* Existing slash commands must continue to work.
* Existing DB rows must not require migration.
* Existing notification kinds and statuses must remain unchanged.
* Existing scheduled report send timing must remain unchanged.
* Do not add interval-selection features as part of this rename.
* Do not weaken cooldown, rate-limit, or validation behavior.

## Tests / docs / imports / scripts that must be updated

* Update Discord bot tests for parsed action names and constants.
* Add or keep tests proving old Discord `custom_id` values are accepted when aliases are introduced.
* Update docs to distinguish report content filters from Discord events.
* Update `.env.example` wording if it describes this feature with stale “third-version” or daily-only language.
* Do not rename package scripts or env variables.

## Validation commands

Run, in order:

```bash
pnpm typecheck:crawler
pnpm test:discord
pnpm lint
```

## Checkpoints

* Search for `daily_report`, `DailyPriceReport`, `EVENT_`, `events`, and `formatPriceReportEvent`.
* Confirm every remaining “daily” name is intentional and tied to the actual `DAILY` interval.
* Confirm every remaining “event” name refers to a real Discord event, not report content filters.
* Confirm existing custom ID string values still parse.

## Done criteria

* Internal names accurately distinguish scheduled report behavior from daily-only implementation details.
* Report content filters no longer use ambiguous Discord-event naming.
* Tests cover compatibility for existing Discord interaction payloads.
* No DB, Discord command, package script, env, or migration contract is broken.

## Stop condition

Stop if the rename requires changing existing Discord `custom_id` strings, slash command names, DB enum values, or persisted settings without a compatibility parser or alias.
