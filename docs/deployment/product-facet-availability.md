# SSD facet availability projection

`product_facet_eligible_products` is a derived, rebuildable read model. Product, category, and
current-price tables remain the domain truth. The projection stores one 1NF row per eligible
product and supported public SSD capacity tag; it does not store product names, prices, or
availability counts.

## Synchronization contract

Migration-owned `SECURITY DEFINER` trigger functions refresh affected projection rows in the same
transaction as these truth changes:

- product insert and changes to source category, filter tags, active state, or exclusion state;
- current-price insert, product move, or delete;
- source-category enabled or IGrp changes;
- product deletion through the projection foreign-key cascade.

The functions use a fixed search path and are not executable by `PUBLIC` or the runtime role.
Runtime services retain ordinary application DML grants but do not own the table, functions,
triggers, or indexes. A trigger failure aborts the truth-table write, so readers never receive a
partially refreshed projection.

The supported tag list in the trigger functions is intentionally the same finite set exposed by the
shared registry. A future taxonomy change must use a new append-only migration that replaces the
functions and rebuilds the projection before the application exposes new candidates. Do not edit an
applied migration.

## Read work contract

The public availability query starts from the finite shared-registry candidates and performs one
`LIMIT 1` B-tree prefix probe per candidate. Its transaction applies and verifies a local statement
timeout, disables sequential and bitmap scans, and keeps ordinary and index-only scans enabled.
It also fails closed unless the projection primary key is ready, valid, and has the reviewed
`(igrp, tag, product_id)` order. These transaction-local settings prevent a statistics change from
turning a fixed candidate probe into a bitmap materialization of every matching product.

## Deployment and rebuild gate

1. Freeze the reviewed release SHA and immutable images. Stop public ingress and crawler/backfill
   writers, then complete the normal backup and isolated-restore gate.
2. Run `pnpm db:deploy`, followed by `pnpm db:configure-runtime-role`.
3. Confirm both projection indexes are ready and valid, all five projection functions are owned by
   the migration role, and neither `PUBLIC` nor the runtime role can execute them directly.
4. Using only the migration connection, rebuild all SSD rows when recovery or taxonomy migration
   requires it:

   ```sql
   SELECT public.refresh_product_facet_eligible_category(id)
   FROM public.source_categories
   WHERE igrp = 7;
   ```

5. Compare aggregate eligible-row and distinct-supported-tag counts with the truth query. Do not
   output product IDs, names, filter-tag arrays, or connection details.
6. Run the private categories/API and product-filter smoke before restoring writers and ingress.

If migration or rebuild fails, keep writers and ingress stopped. PostgreSQL rolls back the failed
transaction; investigate and ship an append-only forward fix rather than editing migration history
or `_prisma_migrations`.

Application rollback is schema-compatible: an older image ignores the projection while the triggers
continue maintaining it. Keep the table and functions in place until a separately reviewed future
cleanup proves that no deployed image needs them.
