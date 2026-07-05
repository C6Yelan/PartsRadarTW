# Goal 1 — CoolPC category product observation write naming

## Title

CoolPC category product observation write naming

## Goal

Rename the CoolPC product write boundary so its names describe the actual lifecycle it owns: writing a successful category observation into products, price snapshots, current prices, and missing/inactive product state.

## Scope

Apply only to internal crawler TypeScript names and their imports/tests.

Primary scope:

* `apps/crawler/src/coolpc/product-write.ts`
* `apps/crawler/src/coolpc/product-write/*`
* `apps/crawler/src/coolpc/category-snapshot.ts`
* `apps/crawler/src/coolpc/crawl-run.ts`
* crawler tests and test helpers that import or assert these names

Out of scope:

* Prisma model, column, enum, table, index, or migration names
* public API response fields
* package scripts
* Compose service names
* runtime behavior changes

## Naming problems to resolve

* `writeCoolpcProductPrices` under-describes the write operation. It writes products, price snapshots, current prices, and missing/inactive state, not only prices.
* `WriteCoolpcProductPricesOptions` and `WriteCoolpcProductPricesResult` inherit the same under-specified wording.
* Boundary variables named `items` / `item` are too generic for a persistence boundary and should identify parsed CoolPC products or a category product observation.
* `ProductItemWriteResult` and `writeProductItem` are generic compared with the surrounding domain.

## Rename strategy

Use one consistent domain term for this boundary: **CoolPC category product observation**.

Recommended target names:

* `writeCoolpcProductPrices` → `writeCoolpcCategoryProductObservation`
* `WriteCoolpcProductPricesOptions` → `WriteCoolpcCategoryProductObservationOptions`
* `WriteCoolpcProductPricesResult` → `WriteCoolpcCategoryProductObservationResult`
* `writeCoolpcProductPricesInTransaction` → `writeCoolpcCategoryProductObservationInTransaction`
* `WriteCoolpcCategoryProducts` → `WriteCoolpcCategoryProductObservation`
* boundary `items` → `parsedProducts`
* boundary `item` → `parsedProduct`
* `ProductItemWriteResult` → `ObservedProductWriteResult`
* `writeProductItem` → `writeObservedProduct`

Keep narrower Prisma delegate and data-shape names only when they are already precise, such as `ProductCreateData`, `PriceSnapshotCreateData`, and `CurrentPriceUpdateData`.

## Files / domains Codex must inspect first

* `apps/crawler/src/coolpc/product-write.ts`
* `apps/crawler/src/coolpc/product-write/types.ts`
* `apps/crawler/src/coolpc/product-write/item-writer.ts`
* `apps/crawler/src/coolpc/product-write/missing-products.ts`
* `apps/crawler/src/coolpc/category-snapshot.ts`
* `apps/crawler/src/coolpc/crawl-run.ts`
* `apps/crawler/tests/coolpc/**`
* any crawler test support files that mock product write clients or product write results

## Required behavior preservation

* Preserve the transaction boundary exactly.
* Preserve price snapshot deduplication behavior.
* Preserve current price update behavior.
* Preserve missing product counting and inactive marking behavior.
* Preserve all result counters and their meanings.
* Preserve category mismatch validation.
* Do not change DB schema, migration history, Prisma mapped names, or generated SQL.
* Do not change package scripts or runtime command names.

## Tests / docs / imports / scripts that must be updated

* Update all imports and exports from the product-write module.
* Update tests and mocks that refer to the old writer names.
* Update comments that still say the module only writes product prices.
* Update any docs that mention the internal product-price writer by name.
* Do not rename npm scripts.

## Validation commands

Run, in order:

```bash
pnpm typecheck:crawler
pnpm test:core
pnpm lint
```

Run this after all goals in the same branch, if feasible:

```bash
pnpm check
```

## Checkpoints

* After the first mechanical rename, run TypeScript or editor symbol checks to catch stale imports.
* Before changing test expectations, confirm no counter names or counter semantics are being changed.
* Before finalizing, search for `writeCoolpcProductPrices`, `WriteCoolpcProductPrices`, `ProductItemWriteResult`, and `writeProductItem`; only intentional compatibility aliases may remain.

## Done criteria

* The product write boundary names describe category product observation persistence, not only price persistence.
* No stale internal references to the old under-specified names remain unless intentionally kept as temporary aliases.
* Existing tests pass without weakening behavior assertions.
* No DB migration, public API contract, package script, Compose, or env contract has changed.

## Stop condition

Stop and leave the old name in place if the rename would require changing Prisma schema names, migration history, DB table/column names, public API response fields, package scripts, or runtime deployment commands.
