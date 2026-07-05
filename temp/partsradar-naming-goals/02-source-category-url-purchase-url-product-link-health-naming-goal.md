# Goal 2 — Source category URL, purchase URL, and product link health naming

## Title

Source category URL, purchase URL, and product link health naming

## Goal

Remove internal ambiguity between the crawled source category URL, the public purchase URL, and product link health names while preserving all existing public and database contracts.

## Scope

Apply to internal variables, helper names, comments, tests, and docs around CoolPC URLs and product link health.

Primary scope:

* `packages/shared/src/coolpc-source.ts`
* `apps/crawler/src/coolpc/parser.ts`
* `apps/crawler/src/coolpc/parser/types.ts`
* `apps/crawler/src/coolpc/parser/urls.ts`
* `apps/crawler/src/coolpc/category-snapshot.ts`
* `apps/crawler/src/coolpc/category-snapshot/parse-result.ts`
* `apps/crawler/src/scripts/ops/product-link-checker/**`
* `apps/web/app/api/products/response.ts`
* `apps/web/app/api/products/[id]/response.ts`
* `apps/web/app/build-list/**`
* `apps/web/app/product-explorer/types.ts`
* `docs/technical/naming-conventions.md`
* URL/link related tests

Out of scope:

* DB column `products.source_url`
* Prisma field `Product.sourceUrl`
* public API field `source.url`
* DB enum `ProductLinkKind.SOURCE`
* DB enum mapped value `"source"`
* package scripts `ops:product-links:*`
* existing build-list localStorage keys

## Naming problems to resolve

* `sourceUrl` is used correctly for the crawled category source URL, but it is easy to confuse with public API `source.url`, which is a purchase URL.
* Public `source.url` must remain for compatibility, but new internal code should not call purchase URLs `sourceUrl`.
* `ProductLinkKind.SOURCE` is a DB compatibility name for the public purchase link health check, not the DB `products.source_url` category URL.
* `ProductLinkCandidate` and helpers such as `buildProductLinks` are generic even though the current checker builds CoolPC purchase-link health targets.
* `createSourceItemKey` / `sourceItemKey` can be mistaken for URL/source attribution rather than a parsed product identity key.

## Rename strategy

Use these terms consistently:

* `sourceCategoryUrl`: CoolPC category page URL such as `eachview.php?IGrp=...`.
* `purchaseUrl` or `coolpcPurchaseUrl`: CoolPC purchase/view URL generated from `ibuyToken`, such as `evaluate.php?iBuy=...`.
* `purchaseLinkHealth` or `productPurchaseLinkHealth`: health checks for the public purchase link.
* `parsedProductKey` or `sourceProductKey`: parser-local stable identity/dedupe key.

Recommended internal renames:

* Parser/context variables that pass category page URLs: `sourceUrl` local parameter → `sourceCategoryUrl`, except when assigning to Prisma `sourceUrl`.
* Product link checker helper `buildProductLinks` → `buildProductPurchaseLinkTargets` or `buildProductLinkHealthTargets`.
* Product link checker local variables named only `links` → `purchaseLinkTargets` when they only contain purchase links.
* `createSourceItemKey` → `createCoolpcSourceProductKey` or `createParsedCoolpcProductKey`.
* `sourceItemKey` → `sourceProductKey` or `parsedProductKey`.

Do not change the generated key string unless tests and code inspection prove it is not persisted, exposed, or used for historical hash comparison. Prefer renaming the helper and field while preserving the exact string output.

Where contract names must remain, add concise comments explaining the compatibility boundary.

## Files / domains Codex must inspect first

* `docs/technical/naming-conventions.md`
* `packages/shared/src/coolpc-source.ts`
* `apps/crawler/src/coolpc/parser/urls.ts`
* `apps/crawler/src/coolpc/parser/types.ts`
* `apps/crawler/src/coolpc/parser.ts`
* `apps/crawler/src/coolpc/category-snapshot.ts`
* `apps/crawler/src/scripts/ops/product-link-checker/types.ts`
* `apps/crawler/src/scripts/ops/product-link-checker/candidates.ts`
* `apps/crawler/src/scripts/ops/product-link-checker/processor.ts`
* `apps/web/app/api/products/response.ts`
* `apps/web/app/api/products/[id]/response.ts`
* tests that assert product response `source.url`, link health, parser output, or parsed result hash

## Required behavior preservation

* Public API response field `source.url` must remain unchanged.
* Public API `source.url` must continue to contain the CoolPC purchase URL.
* DB `products.source_url` must continue to store the crawler source category URL.
* Product link health must continue to check the CoolPC purchase URL.
* `ProductLinkKind.SOURCE` and mapped DB value `"source"` must remain unchanged.
* Existing build-list storage key and stored shape must remain readable.
* Generated CoolPC category and purchase URLs must be byte-for-byte equivalent for the same inputs.
* Parser result hash behavior must remain stable unless the project explicitly accepts a data-history boundary change.

## Tests / docs / imports / scripts that must be updated

* Update parser tests that reference `sourceItemKey` if the field is renamed.
* Update product-link checker tests and support fakes.
* Update web API response tests for comments/types only; response shape must not be broken.
* Update `docs/technical/naming-conventions.md` to keep public/DB compatibility names explicit.
* Do not rename `ops:product-links:check` or `ops:product-links:report`.

## Validation commands

Run, in order:

```bash
pnpm typecheck:crawler
pnpm typecheck:web
pnpm test:core
pnpm lint
```

## Checkpoints

* Search for `sourceUrl` and classify every occurrence as DB/Prisma field assignment or internal category URL variable.
* Search for `source.url` and verify it remains public API compatibility only.
* Search for `ProductLinkKind`, `PRODUCT_LINK_KINDS`, and `SOURCE` to ensure DB enum compatibility names remain intact.
* Search for purchase URL creation and verify no new variable calls it `sourceUrl`.

## Done criteria

* Internal code consistently distinguishes `sourceCategoryUrl` from `purchaseUrl`.
* Link health code names describe purchase-link health targets without changing DB enum contracts.
* Docs clearly explain why `source.url` and `ProductLinkKind.SOURCE` remain compatibility names.
* Tests pass with no public API, DB, storage, script, or Compose contract break.

## Stop condition

Stop and keep the compatibility name if a rename would require changing public API `source.url`, DB `products.source_url`, Prisma mapped names, DB enum values, migration history, Discord output, localStorage keys, package scripts, or Compose/env contracts.
