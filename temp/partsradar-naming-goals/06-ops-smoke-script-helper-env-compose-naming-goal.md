# Goal 6 — Ops smoke, script helper, env, and Compose naming alignment

## Title

Ops smoke, script helper, env, and Compose naming alignment

## Goal

Tighten operations-side names so smoke-test projections, path helpers, env examples, and docs match their actual responsibilities and current Compose behavior.

## Scope

Apply to ops TypeScript names, comments, tests, `.env.example`, and docs.

Primary scope:

* `apps/crawler/src/scripts/ops/production-smoke/types.ts`
* `apps/crawler/src/scripts/ops/production-smoke/**`
* `apps/crawler/src/scripts/shared/script-utils.ts`
* importers of `resolveRelativeToWorkspace`
* ops tests under `apps/crawler/tests/scripts/ops/**`
* `.env.example`
* `compose.yml`
* deployment, ops, security, and Discord docs that mention ops status, smoke envs, or Compose profiles
* root and crawler `package.json` only for reference; do not rename scripts unless aliases are added

Out of scope:

* Changing existing env variable names without aliases
* Changing package script names
* Changing Compose service/volume names
* Changing smoke-test thresholds or behavior
* Changing secret-redaction behavior

## Naming problems to resolve

* Smoke-local response projection types such as `ProductsResponse`, `CategoriesResponse`, `SourceStatusResponse`, `PriceHistoryResponse`, and `ProductDetailResponse` are too generic and can be confused with web API types.
* `resolveRelativeToWorkspace` is misleading because absolute paths remain absolute and the helper is not a workspace containment check.
* `.env.example` and docs may describe ops status/profile names that do not match current `compose.yml`.
* Comments such as “third-version” Discord secrets are legacy wording and should be replaced with current domain wording.
* Legacy smoke fallback env/flag names should be documented as compatibility aliases, not silently treated as canonical names.

## Rename strategy

Use operation-specific prefixes and accurate path-helper wording.

Recommended renames:

* `ProductsResponse` → `SmokeProductsResponse` or `ProductionSmokeProductsResponse`
* `CategoriesResponse` → `SmokeCategoriesResponse`
* `SourceStatusResponse` → `SmokeSourceStatusResponse`
* `PriceHistoryResponse` → `SmokePriceHistoryResponse`
* `ProductDetailResponse` → `SmokeProductDetailResponse`
* `resolveRelativeToWorkspace` → `resolveWorkspacePathArgument` or `resolveScriptPathFromWorkspace`

For `resolveRelativeToWorkspace`, preserve behavior:

* Relative paths resolve from workspace root.
* Absolute paths remain absolute.
* No containment guarantee is implied.
* Keep a temporary alias only if many importers/tests make a staged migration safer.

For env/docs:

* Document active Compose envs separately from non-Compose or future/manual ops envs.
* Keep existing env variable names if code reads them.
* Treat fallback envs such as old smoke broken-link names as compatibility aliases.
* Do not add new env variables unless they are aliases for existing behavior.

## Files / domains Codex must inspect first

* `apps/crawler/src/scripts/ops/production-smoke/types.ts`
* `apps/crawler/src/scripts/ops/production-smoke/options.ts`
* `apps/crawler/src/scripts/ops/production-smoke/checks.ts`
* `apps/crawler/src/scripts/ops/production-smoke/checks/**`
* `apps/crawler/src/scripts/shared/script-utils.ts`
* `apps/crawler/tests/scripts/ops/**`
* `.env.example`
* `compose.yml`
* root `package.json`
* `apps/crawler/package.json`
* docs under `docs/**` that mention ops status, production smoke, Compose profiles, or Discord secrets

## Required behavior preservation

* Existing package scripts remain callable.
* Existing CLI flags and env variables remain accepted.
* Existing fallback env/flag aliases remain accepted.
* Current Compose services, volumes, ports, and env wiring remain unchanged unless a compatibility alias is explicitly documented.
* Secret redaction must remain at least as strict as before.
* Smoke check logic, thresholds, status aggregation, and exit behavior remain unchanged.

## Tests / docs / imports / scripts that must be updated

* Update imports for renamed smoke projection types and path helper.
* Update ops tests that reference generic smoke response type names.
* Update `.env.example` comments to match current Compose behavior.
* Update docs to avoid presenting inactive/absent Compose services or profiles as current deployment requirements.
* Do not rename package scripts. If docs mention old script names, verify against actual `package.json`.

## Validation commands

Run, in order:

```bash
pnpm typecheck:crawler
pnpm test:ops
pnpm lint
```

If Docker is available in the Codex environment, also run:

```bash
docker compose config
```

Run after all goals in the same branch, if feasible:

```bash
pnpm check
```

## Checkpoints

* Search for `ProductsResponse`, `CategoriesResponse`, `SourceStatusResponse`, `PriceHistoryResponse`, and `ProductDetailResponse` under production-smoke.
* Search for `resolveRelativeToWorkspace` and confirm no misleading helper name remains unless a deprecated alias is intentional.
* Compare `.env.example` wording against actual `compose.yml`.
* Search docs for `OPS_WEB`, `ops profile`, `third-version`, and stale smoke env names.
* Confirm package script names were not changed.

## Done criteria

* Ops smoke response projections are clearly namespaced to smoke tests.
* The path helper name accurately reflects its behavior.
* `.env.example` and docs no longer misstate current Compose behavior.
* Legacy env/flag aliases are documented as compatibility aliases where they remain in code.
* Typecheck, relevant tests, and lint pass.

## Stop condition

Stop if the cleanup would require renaming public env variables, package scripts, Compose services, Compose volumes, DB names, or deployment contracts without aliases and documentation.
