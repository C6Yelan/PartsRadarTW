# Goal 3 — Compatible observation type naming for price history points

## Title

Compatible observation type naming for price history points

## Goal

Clarify price-history point provenance by introducing `observationType` as a compatibility-safe alias while preserving the existing `source` response field.

## Scope

Apply to the product price-history API response and related tests/docs.

Primary scope:

* `apps/web/app/api/products/[id]/price-history/response.ts`
* `apps/web/app/api/products/[id]/price-history/handler.ts`
* price-history API tests under `apps/web/tests/**`
* web consumer types, if any consume the price-history response
* API/naming docs

Out of scope:

* Removing `source`
* Route versioning
* DB schema changes
* crawler price snapshot behavior

## Naming problems to resolve

* `PriceHistoryPointResponse.source` currently means observation provenance: `"price_snapshot"` or `"current_price_confirmation"`.
* The field name `source` conflicts with the project-wide meaning of source site attribution, such as CoolPC.
* Removing or renaming `source` directly would break existing clients.

## Rename strategy

Implement a phased compatibility alias:

* Add `observationType` to each price-history point.
* Keep `source` with the exact same value as `observationType`.
* Internally introduce a type such as `PriceHistoryObservationType`.
* Prefer local variables named `observationType` instead of `source`.
* Mark `source` in code comments/docs as a deprecated compatibility alias, not as the canonical internal name.
* Do not remove `source` in this goal.

Example response intent:

```ts
{
  amount,
  currency,
  observedAt,
  observationType: "price_snapshot",
  source: "price_snapshot"
}
```

## Files / domains Codex must inspect first

* `apps/web/app/api/products/[id]/price-history/response.ts`
* `apps/web/app/api/products/[id]/price-history/handler.ts`
* `apps/web/tests/api/products/[id]/**`
* `apps/web/app/products/[id]/**`
* `docs/technical/naming-conventions.md`
* any API docs that mention price history point fields

## Required behavior preservation

* Existing clients using `points[].source` must continue to work.
* Existing values `"price_snapshot"` and `"current_price_confirmation"` must remain unchanged.
* Point ordering, amount, currency, and observedAt values must remain unchanged.
* Summary calculations must remain unchanged.
* No DB migration or route versioning should be introduced.

## Tests / docs / imports / scripts that must be updated

* Update price-history API response tests to assert both `observationType` and compatibility `source`.
* Update TypeScript response types.
* Update docs to say `observationType` is the preferred field and `source` is retained for compatibility.
* Do not update package scripts.

## Validation commands

Run, in order:

```bash
pnpm typecheck:web
pnpm test:core
pnpm lint
```

## Checkpoints

* Confirm every price-history point contains both fields.
* Confirm `source` and `observationType` are always identical.
* Search for `current_price_confirmation` and `price_snapshot` to ensure no value drift.
* Search docs for old guidance that treats price-history `source` as canonical.

## Done criteria

* Price-history response has a clearer canonical field without breaking old clients.
* Tests cover the alias relationship.
* Docs clearly state the compatibility strategy.
* No public route, DB, migration, script, or storage contract is broken.

## Stop condition

Stop if implementing `observationType` would require removing `source`, changing existing enum string values, changing route shape in a versioned way, or altering DB/migration history.
