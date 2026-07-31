import { Prisma } from "@prisma/client";

export const PRODUCT_MOVEMENT_CANDIDATE_LIMIT = 4_096;
export const PRODUCT_MOVEMENT_STATEMENT_TIMEOUT_MS = 2_500;
export const PRODUCT_MOVEMENT_TRANSACTION_TIMEOUT_MS = 3_000;
const PRODUCT_MOVEMENT_RANGE_DAYS = 30;
const PRODUCT_MOVEMENT_INDEX_NAME = "price_snapshots_product_id_captured_at_id_idx";
const MAX_PAGE_SIZE = 100;

export type ProductMovementSort = "price_drop_desc" | "price_rise_desc";

export interface ProductMovementFilters {
  facetTags: string[];
  igrp?: number;
  maxPrice?: number;
  minPrice?: number;
  q?: string;
  status: "active" | "inactive" | "all";
  vendors: string[];
}

export interface ProductMovementSummary {
  productId: string;
  deltaAmount: number | null;
  deltaPercent: number | null;
}

export interface ProductMovementPageResult {
  productIds: string[];
  summaries: ProductMovementSummary[];
  totalItems: number;
}

interface ProductMovementTransactionClient {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

export interface ProductMovementReadClient {
  $transaction<T>(
    callback: (transaction: ProductMovementTransactionClient) => Promise<T>,
    options?: { isolationLevel?: "RepeatableRead"; timeout?: number },
  ): Promise<T>;
}

interface RawProductMovementSummary {
  deltaAmount: number | null;
  deltaPercent: Prisma.Decimal | number | string | null;
  overflow: boolean;
  productId: string | null;
  totalItems: number;
}

interface SnapshotIndexState {
  accessMethod: string;
  hasNoPredicate: boolean;
  isLive: boolean;
  isReady: boolean;
  isValid: boolean;
  keyAttributeCount: number;
  keyNames: string[];
  keyOptions: number[];
  tableName: string;
  tableSchema: string;
  totalAttributeCount: number;
}

export class ProductMovementWorkBudgetExceededError extends Error {
  override readonly name = "ProductMovementWorkBudgetExceededError";

  constructor(readonly limit: number, readonly observed: number) {
    super("Product movement candidate work budget exceeded.");
  }
}

export class ProductMovementReadUnavailableError extends Error {
  override readonly name = "ProductMovementReadUnavailableError";

  constructor() {
    super("Product movement read is temporarily unavailable.");
  }
}

export async function readBoundedProductMovementSummaries(
  client: ProductMovementReadClient,
  productIds: readonly string[],
  now: Date,
): Promise<ProductMovementSummary[]> {
  if (productIds.length === 0) {
    return [];
  }
  if (productIds.length > MAX_PAGE_SIZE || new Set(productIds).size !== productIds.length) {
    throw new ProductMovementReadUnavailableError();
  }

  return runBoundedTransaction(client, async (transaction) => {
    const rows = await transaction.$queryRaw<RawProductMovementSummary[]>(
      createProductMovementSummaryQuery(productIds, now),
    );
    return validateSummaryRows(rows, productIds, productIds.length).summaries;
  });
}

export async function readBoundedProductMovementPage(
  client: ProductMovementReadClient,
  args: {
    filters: ProductMovementFilters;
    sort: ProductMovementSort;
    page: number;
    pageSize: number;
    now: Date;
  },
): Promise<ProductMovementPageResult> {
  if (
    !Number.isSafeInteger(args.page) ||
    args.page < 1 ||
    !Number.isSafeInteger(args.pageSize) ||
    args.pageSize < 1 ||
    args.pageSize > MAX_PAGE_SIZE
  ) {
    throw new ProductMovementReadUnavailableError();
  }

  const requestedOffset = (args.page - 1) * args.pageSize;
  const offset = Number.isSafeInteger(requestedOffset)
    ? Math.min(requestedOffset, PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1)
    : PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1;

  return runBoundedTransaction(client, async (transaction) => {
    const rows = await transaction.$queryRaw<RawProductMovementSummary[]>(
      createProductMovementPageQuery(args.filters, args.sort, args.now, offset, args.pageSize),
    );
    const result = validateSummaryRows(rows, null, args.pageSize);

    if (result.overflow) {
      throw new ProductMovementWorkBudgetExceededError(
        PRODUCT_MOVEMENT_CANDIDATE_LIMIT,
        result.totalItems,
      );
    }

    return {
      productIds: result.summaries.map((summary) => summary.productId),
      summaries: result.summaries,
      totalItems: result.totalItems,
    };
  });
}

async function runBoundedTransaction<T>(
  client: ProductMovementReadClient,
  query: (transaction: ProductMovementTransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await client.$transaction(
      async (transaction) => {
        await configureTransaction(transaction);
        await assertSnapshotIndex(transaction);
        return query(transaction);
      },
      {
        isolationLevel: "RepeatableRead",
        timeout: PRODUCT_MOVEMENT_TRANSACTION_TIMEOUT_MS,
      },
    );
  } catch (error) {
    if (error instanceof ProductMovementWorkBudgetExceededError) {
      throw error;
    }
    if (error instanceof ProductMovementReadUnavailableError || isBudgetError(error)) {
      throw new ProductMovementReadUnavailableError();
    }
    throw error;
  }
}

async function configureTransaction(transaction: ProductMovementTransactionClient): Promise<void> {
  let rows: Array<{
    bitmapScan: string;
    indexOnlyScan: string;
    indexScan: string;
    seqScan: string;
    statementTimeout: string;
  }>;
  try {
    rows = await transaction.$queryRaw(Prisma.sql`
      SELECT
        pg_catalog.set_config('enable_seqscan', 'off', true) AS "seqScan",
        pg_catalog.set_config('enable_bitmapscan', 'off', true) AS "bitmapScan",
        pg_catalog.set_config('enable_indexscan', 'on', true) AS "indexScan",
        pg_catalog.set_config('enable_indexonlyscan', 'on', true) AS "indexOnlyScan",
        pg_catalog.set_config(
          'statement_timeout',
          ${`${PRODUCT_MOVEMENT_STATEMENT_TIMEOUT_MS}ms`},
          true
        ) AS "statementTimeout"
    `);
  } catch {
    throw new ProductMovementReadUnavailableError();
  }
  const guard = rows[0];

  if (
    rows.length !== 1 ||
    !guard ||
    guard.seqScan !== "off" ||
    guard.bitmapScan !== "off" ||
    guard.indexScan !== "on" ||
    guard.indexOnlyScan !== "on" ||
    guard.statementTimeout !== `${PRODUCT_MOVEMENT_STATEMENT_TIMEOUT_MS}ms`
  ) {
    throw new ProductMovementReadUnavailableError();
  }
}

async function assertSnapshotIndex(transaction: ProductMovementTransactionClient): Promise<void> {
  let rows: SnapshotIndexState[];
  try {
    rows = await transaction.$queryRaw<SnapshotIndexState[]>(Prisma.sql`
      SELECT
        table_namespace.nspname AS "tableSchema",
        table_relation.relname AS "tableName",
        index_method.amname AS "accessMethod",
        index_metadata.indisvalid AS "isValid",
        index_metadata.indisready AS "isReady",
        index_metadata.indislive AS "isLive",
        index_metadata.indnkeyatts AS "keyAttributeCount",
        index_metadata.indnatts AS "totalAttributeCount",
        index_metadata.indpred IS NULL AS "hasNoPredicate",
        ARRAY(
          SELECT attribute.attname::text
          FROM pg_catalog.unnest(index_metadata.indkey::smallint[]) WITH ORDINALITY
            AS index_key(attribute_number, position)
          INNER JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = index_metadata.indrelid
            AND attribute.attnum = index_key.attribute_number
          ORDER BY index_key.position
        ) AS "keyNames",
        index_metadata.indoption::smallint[] AS "keyOptions"
      FROM pg_catalog.pg_class AS index_relation
      INNER JOIN pg_catalog.pg_namespace AS index_namespace
        ON index_namespace.oid = index_relation.relnamespace
      INNER JOIN pg_catalog.pg_index AS index_metadata
        ON index_metadata.indexrelid = index_relation.oid
      INNER JOIN pg_catalog.pg_class AS table_relation
        ON table_relation.oid = index_metadata.indrelid
      INNER JOIN pg_catalog.pg_namespace AS table_namespace
        ON table_namespace.oid = table_relation.relnamespace
      INNER JOIN pg_catalog.pg_am AS index_method
        ON index_method.oid = index_relation.relam
      WHERE index_namespace.nspname = 'public'
        AND index_relation.relname = ${PRODUCT_MOVEMENT_INDEX_NAME}
    `);
  } catch {
    throw new ProductMovementReadUnavailableError();
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
    ((index.keyOptions[0] ?? 0) & 1) !== 0 ||
    ((index.keyOptions[1] ?? 0) & 1) !== 1 ||
    ((index.keyOptions[2] ?? 0) & 1) !== 1
  ) {
    throw new ProductMovementReadUnavailableError();
  }
}

export function createProductMovementSummaryQuery(
  productIds: readonly string[],
  now: Date,
): Prisma.Sql {
  if (productIds.length === 0 || productIds.length > MAX_PAGE_SIZE) {
    throw new ProductMovementReadUnavailableError();
  }
  const candidates = Prisma.sql`
    SELECT candidate.product_id, candidate.ordinal
    FROM (VALUES ${Prisma.join(
      productIds.map((productId, ordinal) => Prisma.sql`(${productId}::uuid, ${ordinal}::integer)`),
    )}) AS candidate(product_id, ordinal)
  `;
  return createMovementQuery(candidates, now, Prisma.sql`movement.ordinal ASC`, null);
}

export function createProductMovementPageQuery(
  filters: ProductMovementFilters,
  sort: ProductMovementSort,
  now: Date,
  offset: number,
  pageSize: number,
): Prisma.Sql {
  if (sort !== "price_drop_desc" && sort !== "price_rise_desc") {
    throw new ProductMovementReadUnavailableError();
  }
  const candidates = createFilteredCandidatesQuery(filters);
  const orderBy =
    sort === "price_drop_desc"
      ? Prisma.sql`
          CASE WHEN movement.delta_amount < 0 AND movement.delta_percent < 0 THEN 0 ELSE 1 END ASC,
          CASE WHEN movement.delta_amount < 0 AND movement.delta_percent < 0 THEN movement.delta_percent END ASC,
          CASE WHEN movement.delta_amount < 0 AND movement.delta_percent < 0 THEN movement.delta_amount END ASC,
          movement.product_id ASC
        `
      : Prisma.sql`
          CASE WHEN movement.delta_amount > 0 AND movement.delta_percent > 0 THEN 0 ELSE 1 END ASC,
          CASE WHEN movement.delta_amount > 0 AND movement.delta_percent > 0 THEN movement.delta_percent END DESC,
          CASE WHEN movement.delta_amount > 0 AND movement.delta_percent > 0 THEN movement.delta_amount END DESC,
          movement.product_id ASC
        `;

  return createMovementQuery(candidates, now, orderBy, { offset, pageSize });
}

function createFilteredCandidatesQuery(filters: ProductMovementFilters): Prisma.Sql {
  const predicates: Prisma.Sql[] = [
    Prisma.sql`product.is_excluded = FALSE`,
    Prisma.sql`source_category.enabled = TRUE`,
  ];
  if (filters.status !== "all") {
    predicates.push(Prisma.sql`product.is_active = ${filters.status === "active"}`);
  }
  if (filters.igrp !== undefined) {
    predicates.push(Prisma.sql`source_category.igrp = ${filters.igrp}`);
  }
  if (filters.minPrice !== undefined) {
    predicates.push(Prisma.sql`current_snapshot.price >= ${filters.minPrice}`);
  }
  if (filters.maxPrice !== undefined) {
    predicates.push(Prisma.sql`current_snapshot.price <= ${filters.maxPrice}`);
  }
  for (const token of filters.q?.split(/\s+/).filter(Boolean) ?? []) {
    predicates.push(Prisma.sql`(
      product.name ILIKE ('%' || ${token} || '%')
      OR product.normalized_name ILIKE ('%' || ${token} || '%')
      OR product.vendor_slug ILIKE ('%' || ${token} || '%')
      OR product.vendor_name ILIKE ('%' || ${token} || '%')
    )`);
  }
  if (filters.vendors.length > 0) {
    predicates.push(
      Prisma.sql`product.vendor_slug IN (${Prisma.join(filters.vendors.map((vendor) => Prisma.sql`${vendor}`))})`,
    );
  }
  const tagsByKey = new Map<string, string[]>();
  for (const tag of filters.facetTags) {
    const separator = tag.indexOf(":");
    if (separator <= 0) {
      throw new ProductMovementReadUnavailableError();
    }
    const key = tag.slice(0, separator);
    const tags = tagsByKey.get(key) ?? [];
    tags.push(tag);
    tagsByKey.set(key, tags);
  }
  for (const tags of tagsByKey.values()) {
    predicates.push(
      Prisma.sql`product.filter_tags && ARRAY[${Prisma.join(tags.map((tag) => Prisma.sql`${tag}`))}]::text[]`,
    );
  }

  return Prisma.sql`
    SELECT product.id AS product_id, 0::integer AS ordinal
    FROM public.products AS product
    INNER JOIN public.source_categories AS source_category
      ON source_category.id = product.source_category_id
    INNER JOIN public.current_prices AS current_price
      ON current_price.product_id = product.id
    INNER JOIN public.price_snapshots AS current_snapshot
      ON current_snapshot.id = current_price.price_snapshot_id
      AND current_snapshot.product_id = current_price.product_id
    WHERE ${Prisma.join(predicates, " AND ")}
    LIMIT ${PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1}
  `;
}

function createMovementQuery(
  candidateQuery: Prisma.Sql,
  now: Date,
  orderBy: Prisma.Sql,
  pagination: { offset: number; pageSize: number } | null,
): Prisma.Sql {
  const since = new Date(now.getTime() - PRODUCT_MOVEMENT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const pageClause = pagination
    ? Prisma.sql`LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`
    : Prisma.empty;
  const deltaAmount = Prisma.sql`current_snapshot.price - baseline.price`;
  const deltaPercent = createLegacyDeltaPercentExpression(deltaAmount, Prisma.sql`baseline.price`);

  return Prisma.sql`
    WITH candidates AS MATERIALIZED (${candidateQuery}),
    candidate_state AS (
      SELECT pg_catalog.count(*)::integer AS total_items
      FROM candidates
    ),
    candidate_gate AS MATERIALIZED (
      SELECT candidate.product_id, candidate.ordinal
      FROM candidates AS candidate
      CROSS JOIN candidate_state
      WHERE candidate_state.total_items <= ${PRODUCT_MOVEMENT_CANDIDATE_LIMIT}
    ),
    movement AS (
      SELECT
        candidate.product_id,
        candidate.ordinal,
        CASE
          WHEN current_price.last_seen_at < ${since}::timestamptz OR baseline.price IS NULL THEN NULL
          WHEN baseline.before_range IS FALSE
            AND range_observations.observation_count = 1
            AND range_observations.first_captured_at = current_price.last_seen_at THEN NULL
          ELSE ${deltaAmount}
        END AS delta_amount,
        CASE
          WHEN current_price.last_seen_at < ${since}::timestamptz
            OR baseline.price IS NULL
            OR baseline.price = 0 THEN NULL
          WHEN baseline.before_range IS FALSE
            AND range_observations.observation_count = 1
            AND range_observations.first_captured_at = current_price.last_seen_at THEN NULL
          ELSE ${deltaPercent}
        END AS delta_percent
      FROM candidate_gate AS candidate
      INNER JOIN public.current_prices AS current_price
        ON current_price.product_id = candidate.product_id
      INNER JOIN public.price_snapshots AS current_snapshot
        ON current_snapshot.id = current_price.price_snapshot_id
        AND current_snapshot.product_id = current_price.product_id
      LEFT JOIN LATERAL (
        SELECT snapshot.price, TRUE AS before_range
        FROM public.price_snapshots AS snapshot
        WHERE snapshot.product_id = candidate.product_id
          AND snapshot.captured_at < ${since}::timestamptz
          AND snapshot.captured_at <= ${now}::timestamptz
        ORDER BY snapshot.captured_at DESC, snapshot.id DESC
        LIMIT 1
      ) AS before_range ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          pg_catalog.count(*)::integer AS observation_count,
          (pg_catalog.array_agg(observation.price ORDER BY observation.captured_at, observation.id))[1] AS first_price,
          (pg_catalog.array_agg(observation.captured_at ORDER BY observation.captured_at, observation.id))[1] AS first_captured_at
        FROM (
          SELECT snapshot.id, snapshot.price, snapshot.captured_at
          FROM public.price_snapshots AS snapshot
          WHERE snapshot.product_id = candidate.product_id
            AND snapshot.captured_at >= ${since}::timestamptz
            AND snapshot.captured_at <= ${now}::timestamptz
          ORDER BY snapshot.captured_at ASC, snapshot.id ASC
          LIMIT 2
        ) AS observation
        WHERE before_range.price IS NULL
      ) AS range_observations ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          coalesce(before_range.price, range_observations.first_price) AS price,
          (before_range.price IS NOT NULL) AS before_range
      ) AS baseline ON TRUE
    ),
    page AS MATERIALIZED (
      SELECT ordered.*, pg_catalog.row_number() OVER () AS page_order
      FROM (
        SELECT movement.product_id, movement.delta_amount, movement.delta_percent
        FROM movement
        ORDER BY ${orderBy}
        ${pageClause}
      ) AS ordered
    )
    SELECT
      page.product_id AS "productId",
      page.delta_amount AS "deltaAmount",
      page.delta_percent AS "deltaPercent",
      candidate_state.total_items AS "totalItems",
      FALSE AS overflow,
      page.page_order AS "pageOrder"
    FROM page
    CROSS JOIN candidate_state
    UNION ALL
    SELECT
      NULL::uuid AS "productId",
      NULL::integer AS "deltaAmount",
      NULL::numeric AS "deltaPercent",
      candidate_state.total_items AS "totalItems",
      candidate_state.total_items > ${PRODUCT_MOVEMENT_CANDIDATE_LIMIT} AS overflow,
      1::bigint AS "pageOrder"
    FROM candidate_state
    WHERE NOT EXISTS (SELECT 1 FROM page)
    ORDER BY "pageOrder" ASC
  `;
}

function createLegacyDeltaPercentExpression(
  deltaAmount: Prisma.Sql,
  baselinePrice: Prisma.Sql,
): Prisma.Sql {
  // Preserve legacy Number(...toFixed(2)) by rounding the exact final IEEE-754 value.
  return Prisma.sql`
    (
      SELECT pg_catalog.round(
        (CASE substring(ieee.bits FROM 1 FOR 1)::integer WHEN 1 THEN -1 ELSE 1 END)::numeric
          * (
            CASE substring(ieee.bits FROM 2 FOR 11)::integer
              WHEN 0 THEN 0::numeric
              ELSE 4503599627370496::numeric
            END
            + substring(ieee.bits FROM 13 FOR 52)::bigint::numeric
          )
          / pg_catalog.power(
            2::numeric,
            CASE substring(ieee.bits FROM 2 FOR 11)::integer
              WHEN 0 THEN 1074
              ELSE 1075 - substring(ieee.bits FROM 2 FOR 11)::integer
            END
          )
          * 100::numeric,
        0
      ) / 100::numeric
      FROM (
        SELECT (
          'x' || pg_catalog.encode(
            pg_catalog.float8send(
              (${deltaAmount})::double precision
                / (${baselinePrice})::double precision
                * 100::double precision
            ),
            'hex'
          )
        )::bit(64) AS bits
      ) AS ieee
    )
  `;
}

function validateSummaryRows(
  rows: readonly RawProductMovementSummary[],
  allowedProductIds: readonly string[] | null,
  maximumRows: number,
): { overflow: boolean; summaries: ProductMovementSummary[]; totalItems: number } {
  if (rows.length === 0 || rows.length > Math.max(1, maximumRows)) {
    throw new ProductMovementReadUnavailableError();
  }
  const totalItems = rows[0]?.totalItems;
  if (
    !Number.isSafeInteger(totalItems) ||
    totalItems === undefined ||
    totalItems < 0 ||
    rows.some((row) => row.totalItems !== totalItems)
  ) {
    throw new ProductMovementReadUnavailableError();
  }
  const overflow = rows.some((row) => row.overflow);
  if (overflow) {
    if (rows.length !== 1 || rows[0]?.productId !== null) {
      throw new ProductMovementReadUnavailableError();
    }
    return { overflow: true, summaries: [], totalItems };
  }
  const allowed = allowedProductIds ? new Set(allowedProductIds) : null;
  const seen = new Set<string>();
  const summaries: ProductMovementSummary[] = [];
  for (const row of rows) {
    if (row.productId === null) {
      if (rows.length !== 1) {
        throw new ProductMovementReadUnavailableError();
      }
      continue;
    }
    if ((allowed && !allowed.has(row.productId)) || seen.has(row.productId)) {
      throw new ProductMovementReadUnavailableError();
    }
    seen.add(row.productId);
    const deltaPercent = row.deltaPercent === null ? null : Number(row.deltaPercent);
    if (deltaPercent !== null && !Number.isFinite(deltaPercent)) {
      throw new ProductMovementReadUnavailableError();
    }
    summaries.push({
      productId: row.productId,
      deltaAmount: row.deltaAmount,
      deltaPercent,
    });
  }
  if (allowed && summaries.length !== allowed.size) {
    throw new ProductMovementReadUnavailableError();
  }
  return { overflow: false, summaries, totalItems };
}

function isBudgetError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    cause?: unknown;
    code?: unknown;
    meta?: { code?: unknown; database_error?: unknown };
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
  return candidate.cause !== error && isBudgetError(candidate.cause);
}
