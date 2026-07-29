// packages/db/src/target-price-notification/claim.ts
// 以固定 high-water round 掃描 pending watches，並在短 transaction 內原子 claim 已達標批次。

import { Prisma } from "@prisma/client";
import type {
  ClaimDueTargetPriceNotificationsOptions,
  TargetPriceNotificationClaimBatch,
  TargetPriceNotificationClaimClient,
  TargetPriceNotificationClaimQueryClient,
  TargetPriceNotificationScanState,
  TargetPriceNotificationWatch,
} from "./types";

const MAX_TARGET_PRICE_NOTIFICATION_SCAN_LIMIT = 256;
const MAX_TARGET_PRICE_NOTIFICATION_CLAIM_LIMIT = 25;

interface InitializedScanState extends TargetPriceNotificationScanState {
  roundUpperUpdatedAt: Date;
  roundUpperWatchId: string;
}

interface RawTargetPriceNotificationClaimRow {
  scannedCount: number;
  id: string | null;
  discordUserId: string | null;
  productId: string | null;
  targetPrice: number | null;
  currency: string | null;
  notificationCursorAt: Date | null;
  updatedAt: Date | null;
  productName: string | null;
  currentPrice: number | null;
  currentCurrency: string | null;
  currentCapturedAt: Date | null;
}

export async function claimDueTargetPriceNotifications(
  client: TargetPriceNotificationClaimClient,
  options: ClaimDueTargetPriceNotificationsOptions,
): Promise<TargetPriceNotificationClaimBatch> {
  assertClaimOptions(options);

  return client.$transaction(async (transaction) => {
    let scanState = await lockTargetPriceNotificationScanState(transaction);
    await enforceTargetPriceNotificationBoundedPlan(transaction);

    if (scanState.roundUpperUpdatedAt === null) {
      const initializedState = await initializeTargetPriceNotificationRound(
        transaction,
        options.claimedAt,
      );

      if (!initializedState) {
        return { scannedCount: 0, watches: [] };
      }
      scanState = initializedState;
    }
    assertInitializedScanState(scanState);

    const rows = await transaction.$queryRaw<RawTargetPriceNotificationClaimRow[]>(
      createTargetPriceNotificationClaimQuery(options, scanState),
    );
    const scannedCount = rows[0]?.scannedCount ?? 0;
    const watches = rows
      .filter(
        (
          row,
        ): row is RawTargetPriceNotificationClaimRow & {
          id: string;
          discordUserId: string;
          productId: string;
          targetPrice: number;
          currency: string;
          updatedAt: Date;
          productName: string;
          currentPrice: number;
          currentCurrency: string;
          currentCapturedAt: Date;
        } => row.id !== null,
      )
      .map(toTargetPriceNotificationWatch);

    if (
      scannedCount < 0 ||
      scannedCount > options.scanLimit ||
      watches.length > options.claimLimit
    ) {
      throw new Error("Target price notification claim query exceeded its work budget.");
    }

    return { scannedCount, watches };
  });
}

export async function enforceTargetPriceNotificationBoundedPlan(
  client: TargetPriceNotificationClaimQueryClient,
): Promise<void> {
  const settings = await client.$queryRaw<
    Array<{
      bitmapScan: string;
      fromCollapseLimit: string;
      indexOnlyScan: string;
      indexReady: boolean;
      indexScan: string;
      joinCollapseLimit: string;
      sequentialScan: string;
    }>
  >(Prisma.sql`
      SELECT
        set_config('enable_bitmapscan', 'off', true) AS "bitmapScan",
        set_config('enable_seqscan', 'off', true) AS "sequentialScan",
        set_config('enable_indexscan', 'on', true) AS "indexScan",
        set_config('enable_indexonlyscan', 'on', true) AS "indexOnlyScan",
        set_config('join_collapse_limit', '1', true) AS "joinCollapseLimit",
        set_config('from_collapse_limit', '1', true) AS "fromCollapseLimit",
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_index AS index_meta
          JOIN pg_catalog.pg_class AS index_relation
            ON index_relation.oid = index_meta.indexrelid
          JOIN pg_catalog.pg_class AS table_relation
            ON table_relation.oid = index_meta.indrelid
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = table_relation.relnamespace
          JOIN pg_catalog.pg_am AS access_method
            ON access_method.oid = index_relation.relam
          WHERE namespace.nspname = 'public'
            AND table_relation.relname = 'discord_target_price_watches'
            AND index_relation.relname = 'discord_target_price_watches_pending_scan_idx'
            AND access_method.amname = 'btree'
            AND index_meta.indisvalid
            AND index_meta.indisready
            AND index_meta.indislive
            AND index_meta.indnkeyatts = 2
            AND index_meta.indnatts = 2
            AND pg_catalog.pg_get_indexdef(index_meta.indexrelid, 1, true) = 'updated_at'
            AND pg_catalog.pg_get_indexdef(index_meta.indexrelid, 2, true) = 'id'
            AND pg_catalog.pg_get_expr(index_meta.indpred, index_meta.indrelid)
                = '((enabled = true) AND (last_notified_at IS NULL))'
        ) AS "indexReady"
  `);
  const setting = settings[0];

  if (
    setting?.bitmapScan !== "off" ||
    setting.sequentialScan !== "off" ||
    setting.indexScan !== "on" ||
    setting.indexOnlyScan !== "on" ||
    setting.joinCollapseLimit !== "1" ||
    setting.fromCollapseLimit !== "1" ||
    !setting.indexReady
  ) {
    throw new Error("Target price notification bounded-plan guard was not applied.");
  }
}

export function createTargetPriceNotificationClaimQuery(
  { claimedAt, staleClaimBefore, scanLimit, claimLimit }: ClaimDueTargetPriceNotificationsOptions,
  scanState: TargetPriceNotificationScanState,
): Prisma.Sql {
  assertInitializedScanState(scanState);
  const lowerBound =
    scanState.cursorUpdatedAt === null
      ? Prisma.empty
      : Prisma.sql`
          AND (candidate.updated_at, candidate.id)
              > (${scanState.cursorUpdatedAt}, ${scanState.cursorWatchId}::uuid)
        `;

  return Prisma.sql`
    WITH scan_candidates AS MATERIALIZED (
      SELECT candidate.id, candidate.updated_at
      FROM discord_target_price_watches AS candidate
      WHERE candidate.enabled = true
        AND candidate.last_notified_at IS NULL
        ${lowerBound}
        AND (candidate.updated_at, candidate.id)
            <= (${scanState.roundUpperUpdatedAt}, ${scanState.roundUpperWatchId}::uuid)
      ORDER BY candidate.updated_at ASC, candidate.id ASC
      LIMIT ${scanLimit}
    ),
    due_candidates AS MATERIALIZED (
      SELECT
        watch.id,
        watch.discord_user_id,
        watch.product_id,
        watch.target_price,
        watch.currency,
        watch.notification_cursor_at,
        watch.updated_at,
        product.name AS product_name,
        snapshot.price AS current_price,
        snapshot.currency AS current_currency,
        snapshot.captured_at AS current_captured_at
      FROM scan_candidates AS candidate
      JOIN discord_target_price_watches AS watch ON watch.id = candidate.id
      JOIN products AS product ON product.id = watch.product_id
      JOIN current_prices AS current_price ON current_price.product_id = product.id
      JOIN price_snapshots AS snapshot
        ON snapshot.id = current_price.price_snapshot_id
       AND snapshot.product_id = current_price.product_id
      WHERE watch.enabled = true
        AND watch.last_notified_at IS NULL
        AND (
          watch.notification_claimed_at IS NULL
          OR watch.notification_claimed_at <= ${staleClaimBefore}
        )
        AND product.is_active = true
        AND product.is_excluded = false
        AND snapshot.currency = watch.currency
        AND (
          watch.notification_cursor_at IS NULL
          OR snapshot.captured_at > watch.notification_cursor_at
        )
        AND snapshot.price <= watch.target_price
      ORDER BY candidate.updated_at ASC, watch.id ASC
      LIMIT ${claimLimit}
      FOR UPDATE OF watch SKIP LOCKED
    ),
    claimed AS (
      UPDATE discord_target_price_watches AS watch
      SET notification_claimed_at = ${claimedAt}
      FROM due_candidates AS candidate
      WHERE watch.id = candidate.id
      RETURNING watch.id
    ),
    claimed_details AS MATERIALIZED (
      SELECT candidate.*
      FROM due_candidates AS candidate
      JOIN claimed ON claimed.id = candidate.id
    ),
    scan_progress AS MATERIALIZED (
      SELECT
        COUNT(candidate.id)::integer AS scanned_count,
        (
          ARRAY_AGG(
            candidate.updated_at
            ORDER BY candidate.updated_at DESC, candidate.id DESC
          )
        )[1] AS last_updated_at,
        (
          ARRAY_AGG(
            candidate.id
            ORDER BY candidate.updated_at DESC, candidate.id DESC
          )
        )[1] AS last_watch_id
      FROM scan_candidates AS candidate
    ),
    claim_progress AS MATERIALIZED (
      SELECT
        COUNT(claimed.id)::integer AS claimed_count,
        (
          ARRAY_AGG(
            claimed.updated_at
            ORDER BY claimed.updated_at DESC, claimed.id DESC
          )
        )[1] AS last_updated_at,
        (
          ARRAY_AGG(
            claimed.id
            ORDER BY claimed.updated_at DESC, claimed.id DESC
          )
        )[1] AS last_watch_id
      FROM claimed_details AS claimed
    ),
    cursor_progress AS MATERIALIZED (
      SELECT
        scan.scanned_count,
        claim.claimed_count,
        CASE
          WHEN claim.claimed_count = ${claimLimit} THEN claim.last_updated_at
          ELSE scan.last_updated_at
        END AS next_updated_at,
        CASE
          WHEN claim.claimed_count = ${claimLimit} THEN claim.last_watch_id
          ELSE scan.last_watch_id
        END AS next_watch_id
      FROM scan_progress AS scan
      CROSS JOIN claim_progress AS claim
    ),
    advanced_scan_state AS (
      UPDATE discord_target_price_notification_scan_state AS state
      SET
        cursor_updated_at = CASE
          WHEN (
              progress.claimed_count = ${claimLimit}
              OR progress.scanned_count = ${scanLimit}
            )
            AND (progress.next_updated_at, progress.next_watch_id)
                < (state.round_upper_updated_at, state.round_upper_watch_id)
          THEN progress.next_updated_at
          ELSE NULL
        END,
        cursor_watch_id = CASE
          WHEN (
              progress.claimed_count = ${claimLimit}
              OR progress.scanned_count = ${scanLimit}
            )
            AND (progress.next_updated_at, progress.next_watch_id)
                < (state.round_upper_updated_at, state.round_upper_watch_id)
          THEN progress.next_watch_id
          ELSE NULL
        END,
        round_upper_updated_at = CASE
          WHEN (
              progress.claimed_count = ${claimLimit}
              OR progress.scanned_count = ${scanLimit}
            )
            AND (progress.next_updated_at, progress.next_watch_id)
                < (state.round_upper_updated_at, state.round_upper_watch_id)
          THEN state.round_upper_updated_at
          ELSE NULL
        END,
        round_upper_watch_id = CASE
          WHEN (
              progress.claimed_count = ${claimLimit}
              OR progress.scanned_count = ${scanLimit}
            )
            AND (progress.next_updated_at, progress.next_watch_id)
                < (state.round_upper_updated_at, state.round_upper_watch_id)
          THEN state.round_upper_watch_id
          ELSE NULL
        END,
        updated_at = ${claimedAt}
      FROM cursor_progress AS progress
      WHERE state.id = 1
      RETURNING state.id
    )
    SELECT
      progress.scanned_count AS "scannedCount",
      claimed.id,
      claimed.discord_user_id AS "discordUserId",
      claimed.product_id AS "productId",
      claimed.target_price AS "targetPrice",
      claimed.currency::text AS currency,
      claimed.notification_cursor_at AS "notificationCursorAt",
      claimed.updated_at AS "updatedAt",
      claimed.product_name AS "productName",
      claimed.current_price AS "currentPrice",
      claimed.current_currency::text AS "currentCurrency",
      claimed.current_captured_at AS "currentCapturedAt"
    FROM scan_progress AS progress
    CROSS JOIN (SELECT COUNT(*) FROM advanced_scan_state) AS advanced
    LEFT JOIN claimed_details AS claimed ON true
    ORDER BY claimed.updated_at ASC NULLS LAST, claimed.id ASC
  `;
}

async function lockTargetPriceNotificationScanState(
  client: TargetPriceNotificationClaimQueryClient,
): Promise<TargetPriceNotificationScanState> {
  const rows = await client.$queryRaw<TargetPriceNotificationScanState[]>(Prisma.sql`
    SELECT
      state.cursor_updated_at AS "cursorUpdatedAt",
      state.cursor_watch_id AS "cursorWatchId",
      state.round_upper_updated_at AS "roundUpperUpdatedAt",
      state.round_upper_watch_id AS "roundUpperWatchId"
    FROM discord_target_price_notification_scan_state AS state
    WHERE state.id = 1
    FOR UPDATE
  `);
  const state = rows[0];

  if (!state) {
    throw new Error("Target price notification scan state is missing.");
  }
  return state;
}

async function initializeTargetPriceNotificationRound(
  client: TargetPriceNotificationClaimQueryClient,
  initializedAt: Date,
): Promise<TargetPriceNotificationScanState | null> {
  const rows = await client.$queryRaw<TargetPriceNotificationScanState[]>(
    createTargetPriceNotificationRoundInitializationQuery(initializedAt),
  );

  return rows[0] ?? null;
}

export function createTargetPriceNotificationRoundInitializationQuery(
  initializedAt: Date,
): Prisma.Sql {
  return Prisma.sql`
    UPDATE discord_target_price_notification_scan_state AS state
    SET
      round_upper_updated_at = upper_bound.updated_at,
      round_upper_watch_id = upper_bound.id,
      updated_at = ${initializedAt}
    FROM (
      SELECT watch.updated_at, watch.id
      FROM discord_target_price_watches AS watch
      WHERE watch.enabled = true
        AND watch.last_notified_at IS NULL
      ORDER BY watch.updated_at DESC, watch.id DESC
      LIMIT 1
    ) AS upper_bound
    WHERE state.id = 1
      AND state.round_upper_updated_at IS NULL
    RETURNING
      state.cursor_updated_at AS "cursorUpdatedAt",
      state.cursor_watch_id AS "cursorWatchId",
      state.round_upper_updated_at AS "roundUpperUpdatedAt",
      state.round_upper_watch_id AS "roundUpperWatchId"
  `;
}

function assertInitializedScanState(
  state: TargetPriceNotificationScanState,
): asserts state is InitializedScanState {
  if (
    (state.cursorUpdatedAt === null) !== (state.cursorWatchId === null) ||
    state.roundUpperUpdatedAt === null ||
    state.roundUpperWatchId === null
  ) {
    throw new Error("Target price notification scan state is incomplete.");
  }
}

function toTargetPriceNotificationWatch(
  row: RawTargetPriceNotificationClaimRow & {
    id: string;
    discordUserId: string;
    productId: string;
    targetPrice: number;
    currency: string;
    updatedAt: Date;
    productName: string;
    currentPrice: number;
    currentCurrency: string;
    currentCapturedAt: Date;
  },
): TargetPriceNotificationWatch {
  return {
    id: row.id,
    discordUserId: row.discordUserId,
    productId: row.productId,
    targetPrice: row.targetPrice,
    currency: row.currency,
    notificationCursorAt: row.notificationCursorAt,
    updatedAt: row.updatedAt,
    product: {
      id: row.productId,
      name: row.productName,
      currentPrice: {
        priceSnapshot: {
          price: row.currentPrice,
          currency: row.currentCurrency,
          capturedAt: row.currentCapturedAt,
        },
      },
    },
  };
}

function assertClaimOptions(options: ClaimDueTargetPriceNotificationsOptions): void {
  for (const [name, value] of [
    ["scanLimit", options.scanLimit],
    ["claimLimit", options.claimLimit],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive safe integer.`);
    }
  }
  if (options.claimLimit > options.scanLimit) {
    throw new RangeError("claimLimit must not exceed scanLimit.");
  }
  if (
    options.scanLimit > MAX_TARGET_PRICE_NOTIFICATION_SCAN_LIMIT ||
    options.claimLimit > MAX_TARGET_PRICE_NOTIFICATION_CLAIM_LIMIT
  ) {
    throw new RangeError("Target price notification work budget exceeds the fixed maximum.");
  }
  if (
    !Number.isFinite(options.claimedAt.getTime()) ||
    !Number.isFinite(options.staleClaimBefore.getTime()) ||
    options.staleClaimBefore.getTime() > options.claimedAt.getTime()
  ) {
    throw new RangeError("Claim timestamps must define a valid, non-negative lease window.");
  }
}
