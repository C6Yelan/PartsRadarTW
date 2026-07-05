# Goal 5 — Discord target-price watch naming

## Title

Discord target-price watch naming

## Goal

Clarify that Discord “watch” internals refer to target-price watches, while preserving existing Discord command names, custom IDs, DB names, and user-facing behavior.

## Scope

Apply to internal Discord bot TypeScript names, exports, tests, and docs around target-price watches.

Primary scope:

* `apps/crawler/src/scripts/ops/discord-bot/watch.ts`
* `apps/crawler/src/scripts/ops/discord-bot/types/watch.ts`
* `apps/crawler/src/scripts/ops/discord-bot/target-price-notification.ts`
* `apps/crawler/src/scripts/ops/discord-bot/target-price-notification/**`
* `apps/crawler/src/scripts/ops/discord-bot/commands/ids.ts`
* Discord interaction files that parse or handle watch components/modals
* Discord watch and target-price notification tests
* `docs/technical/discord-contract.md`
* `docs/technical/naming-conventions.md`

Out of scope:

* Changing the `/watch` command name
* Changing existing `watch:*` Discord custom ID prefixes without aliases
* Renaming Prisma model `DiscordTargetPriceWatch`
* Renaming DB tables, columns, indexes, or enum values
* Changing target-price notification behavior

## Naming problems to resolve

* Generic `watch` names can be confused with build lists, generic watchlists, or report scopes.
* The domain intent is target-price watches.
* Parsed types such as `ParsedWatchComponent` and `ParsedWatchModal` do not state the target-price domain.
* DB/report wording such as `WATCHLIST` should be documented as compatibility/domain shorthand, not expanded into new generic watchlist behavior.

## Rename strategy

Use `TargetPriceWatch` for internal TypeScript types and helpers.

Recommended internal renames:

* `ParsedWatchComponent` → `ParsedTargetPriceWatchComponent`
* `ParsedWatchModal` → `ParsedTargetPriceWatchModal`
* `TargetPriceWatchStatusFilter` can remain as-is because it is already precise.
* `TargetPriceWatchSortKey` can remain as-is because it is already precise.
* Generic local names such as `watchInput` may remain where the UI input is actually the target-price watch selector, but prefer `targetPriceWatchInput` at module boundaries.
* If barrel exports are used by tests, either update imports directly or keep temporary type aliases with deprecation comments.

Do not change Discord custom ID values such as `watch:create-modal`, `watch:add`, or `watch:remove-*`. If Codex chooses to introduce clearer new custom IDs, it must parse both old and new IDs and keep old IDs documented as compatibility values.

## Files / domains Codex must inspect first

* `apps/crawler/src/scripts/ops/discord-bot/types/watch.ts`
* `apps/crawler/src/scripts/ops/discord-bot/watch.ts`
* `apps/crawler/src/scripts/ops/discord-bot/commands/ids.ts`
* Discord interaction parser/handler files that reference `ParsedWatch*`
* `apps/crawler/src/scripts/ops/discord-bot/target-price-notification.ts`
* `apps/crawler/src/scripts/ops/discord-bot/target-price-notification/**`
* `apps/crawler/tests/scripts/ops/discord-bot/*watch*`
* `apps/crawler/tests/scripts/ops/discord-bot/*target-price*`
* `docs/technical/discord-contract.md`

## Required behavior preservation

* `/watch` remains the user-facing command.
* Existing `watch:*` custom IDs remain accepted.
* Existing target-price watch rows remain valid.
* Existing notification claim/delivery/dedupe behavior remains unchanged.
* Existing list, create, edit, remove, filter, sort, pagination, and bulk-remove behavior remains unchanged.
* No DB migration is introduced.

## Tests / docs / imports / scripts that must be updated

* Update imports from `types/watch.ts`.
* Update tests that use `ParsedWatchComponent` or `ParsedWatchModal`.
* Update docs to state that “watch” command IDs are compatibility wire names for target-price watches.
* Do not rename package scripts or env variables.

## Validation commands

Run, in order:

```bash
pnpm typecheck:crawler
pnpm test:discord
pnpm lint
```

## Checkpoints

* Search for `ParsedWatch`, `watchInput`, `WATCH_`, and `watch:*`.
* Confirm every remaining generic “watch” name is either a Discord wire contract or intentionally local.
* Confirm docs explain the compatibility boundary.
* Confirm no Prisma schema or migration files were edited.

## Done criteria

* Internal TypeScript names clearly identify target-price watch behavior.
* Existing Discord wire contracts remain accepted.
* Tests pass and cover target-price watch behavior under the renamed types.
* No DB, Discord, package script, env, or migration contract is broken.

## Stop condition

Stop if the rename requires changing `/watch`, existing `watch:*` custom IDs, Prisma schema names, DB mapped names, or migration history without a compatibility layer.
