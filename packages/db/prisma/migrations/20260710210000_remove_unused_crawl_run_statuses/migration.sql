BEGIN;

LOCK TABLE "crawl_runs" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "crawl_run_category_results" IN SHARE MODE;

-- Category results are the surviving source of truth for completed crawl outcomes.
-- Legacy rows without category results are conservatively treated as fetch failures so
-- they cannot advance the successful-crawl freshness signal.
WITH category_summary AS (
    SELECT
        "crawl_run_id",
        COUNT(*) AS result_count,
        COUNT(*) FILTER (
            WHERE "status"::text IN ('success_changed', 'success_unchanged')
        ) AS success_count,
        BOOL_OR("status"::text = 'success_changed') AS has_success_changed,
        BOOL_OR("status"::text = 'suspected_block') AS has_suspected_block,
        BOOL_OR("status"::text = 'parse_failed') AS has_parse_failed,
        BOOL_OR("status"::text = 'fetch_failed') AS has_fetch_failed
    FROM "crawl_run_category_results"
    GROUP BY "crawl_run_id"
),
legacy_status_mapping AS (
    SELECT
        crawl_run."id",
        CASE
            WHEN category_summary."crawl_run_id" IS NULL THEN 'fetch_failed'
            WHEN category_summary.has_suspected_block THEN 'suspected_block'
            WHEN category_summary.success_count = category_summary.result_count
                AND category_summary.has_success_changed THEN 'success_changed'
            WHEN category_summary.success_count = category_summary.result_count
                THEN 'success_unchanged'
            WHEN category_summary.success_count > 0 THEN 'success_with_errors'
            WHEN category_summary.has_parse_failed THEN 'parse_failed'
            WHEN category_summary.has_fetch_failed THEN 'fetch_failed'
            ELSE NULL
        END AS mapped_status
    FROM "crawl_runs" AS crawl_run
    LEFT JOIN category_summary
        ON category_summary."crawl_run_id" = crawl_run."id"
    WHERE crawl_run."status"::text IN ('skipped_overlap', 'backoff')
)
UPDATE "crawl_runs" AS crawl_run
SET "status" = legacy_status_mapping.mapped_status::"crawl_run_status"
FROM legacy_status_mapping
WHERE crawl_run."id" = legacy_status_mapping."id"
    AND legacy_status_mapping.mapped_status IS NOT NULL;

DO $$
DECLARE
    skipped_overlap_count BIGINT;
    backoff_count BIGINT;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE "status"::text = 'skipped_overlap'),
        COUNT(*) FILTER (WHERE "status"::text = 'backoff')
    INTO skipped_overlap_count, backoff_count
    FROM "crawl_runs";

    IF skipped_overlap_count > 0 OR backoff_count > 0 THEN
        RAISE EXCEPTION
            'Cannot remove crawl_run_status values: skipped_overlap rows=%, backoff rows=%',
            skipped_overlap_count,
            backoff_count
            USING
                ERRCODE = '23514',
                HINT = 'Stop and obtain an explicit approved mapping or defer this enum removal.';
    END IF;
END
$$;

ALTER TABLE "crawl_runs"
    ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "crawl_run_status_new" AS ENUM (
    'running',
    'success_changed',
    'success_unchanged',
    'success_with_errors',
    'fetch_failed',
    'suspected_block',
    'parse_failed'
);

ALTER TABLE "crawl_runs"
    ALTER COLUMN "status" TYPE "crawl_run_status_new"
    USING ("status"::text::"crawl_run_status_new");

DROP TYPE "crawl_run_status";
ALTER TYPE "crawl_run_status_new" RENAME TO "crawl_run_status";

ALTER TABLE "crawl_runs"
    ALTER COLUMN "status" SET DEFAULT 'running'::"crawl_run_status";

COMMIT;
