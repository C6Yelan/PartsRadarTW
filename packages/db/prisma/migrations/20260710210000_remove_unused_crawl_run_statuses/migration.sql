BEGIN;

LOCK TABLE "crawl_runs" IN ACCESS EXCLUSIVE MODE;

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
