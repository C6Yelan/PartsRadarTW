// apps/crawler/src/scripts/ops/discord-bot/watch/list.ts

import { MAX_TARGET_PRICE_WATCHES_PER_USER } from "../constants";
import type {
  DiscordBotClient,
  TargetPriceWatchSortKey,
  TargetPriceWatchStatusFilter,
} from "../types";
import {
  matchesWatchStatusFilter,
  normalizeWatchSortKey,
  normalizeWatchStatusFilter,
  sortTargetPriceWatches,
} from "./list-state";
import { WATCH_MANAGER_PAGE_SIZE } from "./list-limits";
import {
  TARGET_PRICE_WATCH_LIST_SELECT,
  type TargetPriceWatchlistResult,
} from "./records";

export async function readTargetPriceWatchlist({
  client,
  discordUserId,
  page = 0,
  statusFilter = "all",
  sortKey = "recent",
}: {
  client: DiscordBotClient;
  discordUserId: string;
  page?: number;
  statusFilter?: TargetPriceWatchStatusFilter;
  sortKey?: TargetPriceWatchSortKey;
}): Promise<TargetPriceWatchlistResult> {
  const boundedPage = Number.isSafeInteger(page) && page > 0 ? page : 0;
  const normalizedStatusFilter = normalizeWatchStatusFilter(statusFilter);
  const normalizedSortKey = normalizeWatchSortKey(sortKey);
  const watches = await client.discordTargetPriceWatch.findMany({
    where: {
      discordUserId,
      enabled: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: MAX_TARGET_PRICE_WATCHES_PER_USER + 1,
    select: TARGET_PRICE_WATCH_LIST_SELECT,
  });
  const filteredWatches = watches.filter((watch) =>
    matchesWatchStatusFilter(watch, normalizedStatusFilter),
  );
  const sortedWatches = sortTargetPriceWatches(filteredWatches, normalizedSortKey);
  const pageStart = boundedPage * WATCH_MANAGER_PAGE_SIZE;
  const listedWatches = sortedWatches.slice(pageStart, pageStart + WATCH_MANAGER_PAGE_SIZE);

  return {
    watches: listedWatches,
    page: boundedPage,
    statusFilter: normalizedStatusFilter,
    sortKey: normalizedSortKey,
    totalCount: watches.length,
    filteredCount: filteredWatches.length,
    hasPreviousPage: boundedPage > 0,
    hasNextPage: sortedWatches.length > pageStart + WATCH_MANAGER_PAGE_SIZE,
  };
}
