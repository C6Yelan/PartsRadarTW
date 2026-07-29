// apps/web/app/api/products/[id]/price-history/data.ts
// 定義商品價格歷史 API 使用的 Prisma select、回傳型別與窄 read client contract。

import type { Prisma } from "@partsradar/db";

import {
  PRICE_HISTORY_BUCKET_COUNT,
  PRICE_HISTORY_DB_STATEMENT_TIMEOUT_MS,
  PRICE_HISTORY_DB_TRANSACTION_TIMEOUT_MS,
  PRICE_HISTORY_INDEX_NAME,
  PRICE_HISTORY_RAW_PROBE_LIMIT,
  PRICE_HISTORY_SNAPSHOT_LIMIT,
} from "./limits";

export const PRICE_HISTORY_SNAPSHOT_SELECT = {
  id: true,
  price: true,
  capturedAt: true,
} as const satisfies Prisma.PriceSnapshotSelect;

export const PRICE_HISTORY_PRODUCT_SELECT = {
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
        },
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

export type PriceHistoryProductRecord = Prisma.ProductGetPayload<{
  select: typeof PRICE_HISTORY_PRODUCT_SELECT;
}>;
export type PriceHistorySnapshotRecord = Prisma.PriceSnapshotGetPayload<{
  select: typeof PRICE_HISTORY_SNAPSHOT_SELECT;
}>;

type ProductFindFirstArgs = Omit<Prisma.ProductFindFirstArgs, "select"> & {
  select: typeof PRICE_HISTORY_PRODUCT_SELECT;
};
interface PriceHistoryRawQueryClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

interface PriceHistoryGuardState {
  seqScan: string;
  bitmapScan: string;
  indexScan: string;
  indexOnlyScan: string;
  statementTimeout: string;
}

interface PriceHistoryIndexState {
  tableSchema: string;
  tableName: string;
  accessMethod: string;
  isValid: boolean;
  isReady: boolean;
  isLive: boolean;
  keyAttributeCount: number;
  totalAttributeCount: number;
  hasNoPredicate: boolean;
  keyNames: string[];
  keyOptions: number[];
}

export interface PriceHistorySnapshotReadResult {
  snapshots: PriceHistorySnapshotRecord[];
  downsampled: boolean;
}

export class PriceHistoryReadUnavailableError extends Error {
  constructor() {
    super("Price history read is temporarily unavailable.");
    this.name = "PriceHistoryReadUnavailableError";
  }
}

// 限定價格歷史 handler 需要的 DB 讀取面，不依賴完整 Prisma client。
export interface ProductPriceHistoryReadClient {
  product: {
    findFirst(args: ProductFindFirstArgs): Promise<PriceHistoryProductRecord | null>;
  };
  $transaction<T>(
    callback: (client: PriceHistoryRawQueryClient) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>;
}

// 在同一 transaction 內固定 planner 與 statement budget，先做 limit+1 probe；
// 只有 overflow 才以固定數量的 half-open time buckets 做 index-seek sampling。
export async function readBoundedPriceHistorySnapshots(
  client: ProductPriceHistoryReadClient,
  productId: string,
  since: Date | null,
): Promise<PriceHistorySnapshotReadResult> {
  try {
    return await client.$transaction(
      async (transaction) => {
        await configureBoundedPriceHistoryTransaction(transaction);
        await assertPriceHistoryIndex(transaction);

        const probe = since
          ? await transaction.$queryRaw<PriceHistorySnapshotRecord[]>`
              SELECT
                snapshot."id",
                snapshot."price",
                snapshot."captured_at" AS "capturedAt"
              FROM public."price_snapshots" AS snapshot
              WHERE snapshot."product_id" = ${productId}::uuid
                AND snapshot."captured_at" >= ${since}::timestamptz
              ORDER BY snapshot."captured_at" ASC, snapshot."id" ASC
              LIMIT ${PRICE_HISTORY_RAW_PROBE_LIMIT}
            `
          : await transaction.$queryRaw<PriceHistorySnapshotRecord[]>`
              SELECT
                snapshot."id",
                snapshot."price",
                snapshot."captured_at" AS "capturedAt"
              FROM public."price_snapshots" AS snapshot
              WHERE snapshot."product_id" = ${productId}::uuid
              ORDER BY snapshot."captured_at" ASC, snapshot."id" ASC
              LIMIT ${PRICE_HISTORY_RAW_PROBE_LIMIT}
            `;

        if (probe.length <= PRICE_HISTORY_SNAPSHOT_LIMIT) {
          return {
            snapshots: probe,
            downsampled: false,
          };
        }

        const firstSnapshot = probe[0];
        const latestSnapshot = await readLatestPriceHistorySnapshot(transaction, productId);

        if (!firstSnapshot || !latestSnapshot) {
          throw new PriceHistoryReadUnavailableError();
        }

        const snapshots = await readSampledPriceHistorySnapshots(
          transaction,
          productId,
          firstSnapshot,
          latestSnapshot,
        );

        if (snapshots.length > PRICE_HISTORY_SNAPSHOT_LIMIT) {
          throw new PriceHistoryReadUnavailableError();
        }

        return {
          snapshots,
          downsampled: true,
        };
      },
      {
        timeout: PRICE_HISTORY_DB_TRANSACTION_TIMEOUT_MS,
      },
    );
  } catch (error) {
    if (error instanceof PriceHistoryReadUnavailableError || isPriceHistoryBudgetError(error)) {
      if (error instanceof PriceHistoryReadUnavailableError) {
        throw error;
      }

      throw new PriceHistoryReadUnavailableError();
    }

    throw error;
  }
}

async function configureBoundedPriceHistoryTransaction(
  transaction: PriceHistoryRawQueryClient,
): Promise<void> {
  let rows: PriceHistoryGuardState[];

  try {
    rows = await transaction.$queryRaw<PriceHistoryGuardState[]>`
      SELECT
        pg_catalog.set_config('enable_seqscan', 'off', true) AS "seqScan",
        pg_catalog.set_config('enable_bitmapscan', 'off', true) AS "bitmapScan",
        pg_catalog.set_config('enable_indexscan', 'on', true) AS "indexScan",
        pg_catalog.set_config('enable_indexonlyscan', 'on', true) AS "indexOnlyScan",
        pg_catalog.set_config(
          'statement_timeout',
          ${`${PRICE_HISTORY_DB_STATEMENT_TIMEOUT_MS}ms`},
          true
        ) AS "statementTimeout"
    `;
  } catch {
    throw new PriceHistoryReadUnavailableError();
  }

  const guard = rows[0];

  if (
    rows.length !== 1 ||
    !guard ||
    guard.seqScan !== "off" ||
    guard.bitmapScan !== "off" ||
    guard.indexScan !== "on" ||
    guard.indexOnlyScan !== "on" ||
    guard.statementTimeout !== `${PRICE_HISTORY_DB_STATEMENT_TIMEOUT_MS}ms`
  ) {
    throw new PriceHistoryReadUnavailableError();
  }
}

async function assertPriceHistoryIndex(transaction: PriceHistoryRawQueryClient): Promise<void> {
  let rows: PriceHistoryIndexState[];

  try {
    rows = await transaction.$queryRaw<PriceHistoryIndexState[]>`
      SELECT
        table_namespace."nspname" AS "tableSchema",
        table_relation."relname" AS "tableName",
        access_method."amname" AS "accessMethod",
        index_state."indisvalid" AS "isValid",
        index_state."indisready" AS "isReady",
        index_state."indislive" AS "isLive",
        index_state."indnkeyatts" AS "keyAttributeCount",
        index_state."indnatts" AS "totalAttributeCount",
        index_state."indpred" IS NULL AS "hasNoPredicate",
        ARRAY(
          SELECT attribute."attname"::text
          FROM pg_catalog.unnest(index_state."indkey"::smallint[]) WITH ORDINALITY
            AS index_key("attributeNumber", "position")
          JOIN pg_catalog."pg_attribute" AS attribute
            ON attribute."attrelid" = index_state."indrelid"
           AND attribute."attnum" = index_key."attributeNumber"
          ORDER BY index_key."position"
        ) AS "keyNames",
        index_state."indoption"::smallint[] AS "keyOptions"
      FROM pg_catalog."pg_class" AS index_relation
      JOIN pg_catalog."pg_namespace" AS index_namespace
        ON index_namespace."oid" = index_relation."relnamespace"
      JOIN pg_catalog."pg_index" AS index_state
        ON index_state."indexrelid" = index_relation."oid"
      JOIN pg_catalog."pg_class" AS table_relation
        ON table_relation."oid" = index_state."indrelid"
      JOIN pg_catalog."pg_namespace" AS table_namespace
        ON table_namespace."oid" = table_relation."relnamespace"
      JOIN pg_catalog."pg_am" AS access_method
        ON access_method."oid" = index_relation."relam"
      WHERE index_namespace."nspname" = 'public'
        AND index_relation."relname" = ${PRICE_HISTORY_INDEX_NAME}
    `;
  } catch {
    throw new PriceHistoryReadUnavailableError();
  }

  const index = rows[0];

  if (
    rows.length !== 1 ||
    !index ||
    index.tableSchema !== "public" ||
    index.tableName !== "price_snapshots" ||
    index.accessMethod !== "btree" ||
    !index.isValid ||
    !index.isReady ||
    !index.isLive ||
    index.keyAttributeCount !== 3 ||
    index.totalAttributeCount !== 3 ||
    !index.hasNoPredicate ||
    index.keyNames.join(",") !== "product_id,captured_at,id" ||
    index.keyOptions.length !== 3 ||
    (index.keyOptions[0] ?? 0) & 1 ||
    ((index.keyOptions[1] ?? 0) & 1) !== 1 ||
    ((index.keyOptions[2] ?? 0) & 1) !== 1
  ) {
    throw new PriceHistoryReadUnavailableError();
  }
}

function isPriceHistoryBudgetError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    cause?: unknown;
    meta?: {
      code?: unknown;
      database_error?: unknown;
    };
  };

  if (candidate.code === "P2028" || candidate.code === "57014") {
    return true;
  }

  if (
    candidate.code === "P2010" &&
    (candidate.meta?.code === "57014" ||
      (typeof candidate.meta?.database_error === "string" &&
        candidate.meta.database_error.includes("57014")))
  ) {
    return true;
  }

  return candidate.cause !== error && isPriceHistoryBudgetError(candidate.cause);
}

async function readSampledPriceHistorySnapshots(
  transaction: PriceHistoryRawQueryClient,
  productId: string,
  firstSnapshot: PriceHistorySnapshotRecord,
  latestSnapshot: PriceHistorySnapshotRecord,
): Promise<PriceHistorySnapshotRecord[]> {
  return transaction.$queryRaw<PriceHistorySnapshotRecord[]>`
    WITH "bounds" AS MATERIALIZED (
      SELECT
        ${firstSnapshot.id}::uuid AS "firstId",
        ${firstSnapshot.capturedAt}::timestamptz AS "firstAt",
        ${firstSnapshot.price}::integer AS "firstPrice",
        ${latestSnapshot.id}::uuid AS "latestId",
        ${latestSnapshot.capturedAt}::timestamptz AS "latestAt",
        ${latestSnapshot.price}::integer AS "latestPrice"
    ),
    "bucketIntervals" AS MATERIALIZED (
      SELECT
        bucket_number,
        bounds."firstAt"
          + (bounds."latestAt" - bounds."firstAt")
            * (bucket_number::double precision / ${PRICE_HISTORY_BUCKET_COUNT}::double precision)
          AS "startAt",
        CASE
          WHEN bucket_number = ${PRICE_HISTORY_BUCKET_COUNT - 1}
            THEN bounds."latestAt"
          ELSE bounds."firstAt"
            + (bounds."latestAt" - bounds."firstAt")
              * ((bucket_number + 1)::double precision / ${PRICE_HISTORY_BUCKET_COUNT}::double precision)
        END AS "endAt"
      FROM "bounds" AS bounds
      CROSS JOIN pg_catalog.generate_series(0, ${PRICE_HISTORY_BUCKET_COUNT - 1}) AS bucket_number
    ),
    "representatives" AS (
      SELECT
        bounds."firstId" AS "id",
        bounds."firstPrice" AS "price",
        bounds."firstAt" AS "capturedAt"
      FROM "bounds" AS bounds
      UNION ALL
      SELECT
        bounds."latestId",
        bounds."latestPrice",
        bounds."latestAt"
      FROM "bounds" AS bounds
      UNION ALL
      SELECT
        first_in_bucket."id",
        first_in_bucket."price",
        first_in_bucket."captured_at"
      FROM "bucketIntervals" AS bucket
      CROSS JOIN LATERAL (
        SELECT snapshot."id", snapshot."price", snapshot."captured_at"
        FROM public."price_snapshots" AS snapshot
        WHERE snapshot."product_id" = ${productId}::uuid
          AND snapshot."captured_at" >= bucket."startAt"
          AND snapshot."captured_at" < bucket."endAt"
        ORDER BY snapshot."captured_at" ASC, snapshot."id" ASC
        LIMIT 1
      ) AS first_in_bucket
      UNION ALL
      SELECT
        last_in_bucket."id",
        last_in_bucket."price",
        last_in_bucket."captured_at"
      FROM "bucketIntervals" AS bucket
      CROSS JOIN LATERAL (
        SELECT snapshot."id", snapshot."price", snapshot."captured_at"
        FROM public."price_snapshots" AS snapshot
        WHERE snapshot."product_id" = ${productId}::uuid
          AND snapshot."captured_at" >= bucket."startAt"
          AND snapshot."captured_at" < bucket."endAt"
        ORDER BY snapshot."captured_at" DESC, snapshot."id" DESC
        LIMIT 1
      ) AS last_in_bucket
    ),
    "deduplicated" AS (
      SELECT DISTINCT ON (representatives."id")
        representatives."id",
        representatives."price",
        representatives."capturedAt"
      FROM "representatives" AS representatives
      ORDER BY representatives."id", representatives."capturedAt"
    )
    SELECT
      deduplicated."id",
      deduplicated."price",
      deduplicated."capturedAt"
    FROM "deduplicated" AS deduplicated
    ORDER BY deduplicated."capturedAt" ASC, deduplicated."id" ASC
  `;
}

async function readLatestPriceHistorySnapshot(
  transaction: PriceHistoryRawQueryClient,
  productId: string,
): Promise<PriceHistorySnapshotRecord | null> {
  const rows = await transaction.$queryRaw<PriceHistorySnapshotRecord[]>`
    SELECT
      snapshot."id",
      snapshot."price",
      snapshot."captured_at" AS "capturedAt"
    FROM public."price_snapshots" AS snapshot
    WHERE snapshot."product_id" = ${productId}::uuid
    ORDER BY snapshot."captured_at" DESC, snapshot."id" DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}
