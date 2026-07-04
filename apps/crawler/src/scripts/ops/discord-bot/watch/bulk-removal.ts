// apps/crawler/src/scripts/ops/discord-bot/watch/bulk-removal.ts
import { randomUUID } from "node:crypto";
import type { TargetPriceWatchSortKey, TargetPriceWatchStatusFilter } from "../types";

const WATCH_BULK_REMOVAL_CONFIRMATION_TTL_MS = 5 * 60 * 1000;

interface TargetPriceWatchBulkRemovalConfirmation {
  discordUserId: string;
  watchInputs: string[];
  page: number;
  statusFilter: TargetPriceWatchStatusFilter;
  sortKey: TargetPriceWatchSortKey;
  expiresAt: number;
}

export type TargetPriceWatchBulkRemovalConfirmationResult =
  | {
      status: "found";
      watchInputs: string[];
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    }
  | {
      status: "not_found" | "expired" | "wrong_user";
    };

const WATCH_BULK_REMOVAL_CONFIRMATIONS = new Map<string, TargetPriceWatchBulkRemovalConfirmation>();

export function createTargetPriceWatchBulkRemovalConfirmation({
  discordUserId,
  watchInputs,
  page,
  statusFilter,
  sortKey,
  now = new Date(),
}: {
  discordUserId: string;
  watchInputs: string[];
  page: number;
  statusFilter: TargetPriceWatchStatusFilter;
  sortKey: TargetPriceWatchSortKey;
  now?: Date;
}): string {
  pruneExpiredBulkRemovalConfirmations(now);

  const token = randomUUID();
  WATCH_BULK_REMOVAL_CONFIRMATIONS.set(token, {
    discordUserId,
    watchInputs: [...new Set(watchInputs)],
    page,
    statusFilter,
    sortKey,
    expiresAt: now.getTime() + WATCH_BULK_REMOVAL_CONFIRMATION_TTL_MS,
  });

  return token;
}

export function consumeTargetPriceWatchBulkRemovalConfirmation({
  token,
  discordUserId,
  now = new Date(),
}: {
  token: string | null;
  discordUserId: string;
  now?: Date;
}): TargetPriceWatchBulkRemovalConfirmationResult {
  pruneExpiredBulkRemovalConfirmations(now);

  if (!token) {
    return { status: "not_found" };
  }

  const confirmation = WATCH_BULK_REMOVAL_CONFIRMATIONS.get(token);

  if (!confirmation) {
    return { status: "not_found" };
  }

  if (confirmation.expiresAt <= now.getTime()) {
    WATCH_BULK_REMOVAL_CONFIRMATIONS.delete(token);
    return { status: "expired" };
  }

  if (confirmation.discordUserId !== discordUserId) {
    return { status: "wrong_user" };
  }

  WATCH_BULK_REMOVAL_CONFIRMATIONS.delete(token);

  return {
    status: "found",
    watchInputs: confirmation.watchInputs,
    page: confirmation.page,
    statusFilter: confirmation.statusFilter,
    sortKey: confirmation.sortKey,
  };
}

function pruneExpiredBulkRemovalConfirmations(now: Date): void {
  const nowMs = now.getTime();

  for (const [token, confirmation] of WATCH_BULK_REMOVAL_CONFIRMATIONS) {
    if (confirmation.expiresAt <= nowMs) {
      WATCH_BULK_REMOVAL_CONFIRMATIONS.delete(token);
    }
  }
}
