// apps/crawler/src/scripts/ops/discord-bot/watch.ts

import { randomUUID } from "node:crypto";
import type { Prisma } from "@partsradar/db";
import {
  WATCH_ADD_CUSTOM_ID,
  WATCH_BULK_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_SELECT_CUSTOM_ID_PREFIX,
  WATCH_EDIT_CUSTOM_ID_PREFIX,
  WATCH_FILTER_CUSTOM_ID_PREFIX,
  WATCH_PAGE_CUSTOM_ID_PREFIX,
  WATCH_REFRESH_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_SELECT_CUSTOM_ID_PREFIX,
  WATCH_SORT_CUSTOM_ID_PREFIX,
} from "./commands";
import {
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_COMPONENT_TYPE_STRING_SELECT,
  DISCORD_EMBED_COLOR,
  MAX_TARGET_PRICE,
  MAX_TARGET_PRICE_WATCHES_PER_USER,
  PRODUCT_NAME_MAX_LENGTH,
} from "./constants";
import {
  formatDiscordBotText,
  formatDiscordDeliveryFailureForUser,
  formatDiscordRateLimitForUser,
} from "./rest";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordButtonComponent,
  TargetPriceWatchSortKey,
  TargetPriceWatchStatusFilter,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WATCH_SELECT_VALUE_PREFIX = "watch:";
const WATCH_MANAGER_PAGE_SIZE = 25;
const WATCH_SELECT_LABEL_MAX_LENGTH = 100;
const WATCH_SELECT_DESCRIPTION_MAX_LENGTH = 100;
const WATCH_BULK_REMOVAL_CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const WATCH_MANAGER_GUIDE =
  "追蹤商品目標價，並與目前價格比較。\n\n" +
  "**使用方式**\n" +
  "新增：貼商品頁網址與目標價。\n" +
  `管理：從選單選商品後編輯或移除，每人最多 ${MAX_TARGET_PRICE_WATCHES_PER_USER} 項。`;

const TARGET_PRICE_WATCH_PRODUCT_SELECT = {
  id: true,
  name: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
          currency: true,
          capturedAt: true,
        },
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

const TARGET_PRICE_WATCH_SELECT = {
  id: true,
  discordUserId: true,
  productId: true,
  targetPrice: true,
  currency: true,
  enabled: true,
  lastNotifiedAt: true,
  notificationCursorAt: true,
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

const TARGET_PRICE_WATCH_LIST_SELECT = {
  id: true,
  discordUserId: true,
  productId: true,
  targetPrice: true,
  currency: true,
  enabled: true,
  lastNotifiedAt: true,
  notificationCursorAt: true,
  updatedAt: true,
  product: {
    select: TARGET_PRICE_WATCH_PRODUCT_SELECT,
  },
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

const TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT = {
  status: true,
  errorMessage: true,
  deliveredAt: true,
  createdAt: true,
} as const satisfies Prisma.DiscordNotificationDeliverySelect;

type TargetPriceWatchProductRecord = Prisma.ProductGetPayload<{
  select: typeof TARGET_PRICE_WATCH_PRODUCT_SELECT;
}>;
type SavedTargetPriceWatchRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_SELECT;
}>;
type TargetPriceWatchListRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_LIST_SELECT;
}>;
export type TargetPriceWatchDeliveryStatus = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT;
}>;

export type CreateTargetPriceWatchResult =
  | {
      status: "invalid_product_reference";
    }
  | {
      status: "invalid_target_price";
    }
  | {
      status: "product_not_found";
      productId: string;
    }
  | {
      status: "watch_limit_reached";
      maxWatches: number;
    }
  | {
      status: "saved";
      product: TargetPriceWatchProductRecord;
      watch: SavedTargetPriceWatchRecord;
      currentPrice: number;
      currency: string;
      capturedAt: Date;
      reached: boolean;
    };

export interface TargetPriceWatchlistResult {
  watches: TargetPriceWatchListRecord[];
  page: number;
  statusFilter: TargetPriceWatchStatusFilter;
  sortKey: TargetPriceWatchSortKey;
  totalCount: number;
  filteredCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

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

export type DisableTargetPriceWatchResult =
  | {
      status: "invalid_reference";
    }
  | {
      status: "not_found";
    }
  | {
      status: "disabled";
      watch: TargetPriceWatchListRecord;
    };

export interface DisableTargetPriceWatchesResult {
  disabledCount: number;
  unavailableCount: number;
}

export type TargetPriceWatchLookupResult =
  | {
      status: "invalid_reference";
    }
  | {
      status: "not_found";
    }
  | {
      status: "found";
      watch: TargetPriceWatchListRecord;
    };

export type UpdateTargetPriceWatchResult =
  | {
      status: "invalid_reference" | "invalid_target_price" | "not_found";
    }
  | {
      status: "updated";
      watch: TargetPriceWatchListRecord;
    };

export async function createTargetPriceWatch({
  client,
  discordUserId,
  productInput,
  targetPrice,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  productInput: string | null;
  targetPrice: number | null;
  now?: Date;
}): Promise<CreateTargetPriceWatchResult> {
  const productId = productInput ? normalizeWatchProductReference(productInput) : null;

  if (!productId) {
    return {
      status: "invalid_product_reference",
    };
  }

  if (
    !targetPrice ||
    !Number.isInteger(targetPrice) ||
    targetPrice < 1 ||
    targetPrice > MAX_TARGET_PRICE
  ) {
    return {
      status: "invalid_target_price",
    };
  }

  const product = await client.product.findFirst({
    where: {
      id: productId,
      sourceCategory: {
        enabled: true,
      },
      currentPrice: {
        isNot: null,
      },
    },
    select: TARGET_PRICE_WATCH_PRODUCT_SELECT,
  });

  if (!product?.currentPrice) {
    return {
      status: "product_not_found",
      productId,
    };
  }

  const existingActiveWatch = await client.discordTargetPriceWatch.findFirst({
    where: {
      discordUserId,
      productId,
      enabled: true,
    },
    select: {
      id: true,
    },
  });

  if (
    !existingActiveWatch &&
    (await countActiveTargetPriceWatches({ client, discordUserId })) >=
      MAX_TARGET_PRICE_WATCHES_PER_USER
  ) {
    return {
      status: "watch_limit_reached",
      maxWatches: MAX_TARGET_PRICE_WATCHES_PER_USER,
    };
  }

  const currentPrice = product.currentPrice.priceSnapshot.price;
  const currency = product.currentPrice.priceSnapshot.currency;
  const watch = await client.discordTargetPriceWatch.upsert({
    where: {
      discordUserId_productId: {
        discordUserId,
        productId,
      },
    },
    create: {
      discordUserId,
      productId,
      targetPrice,
      currency,
      enabled: true,
      notificationCursorAt: now,
    },
    update: {
      targetPrice,
      currency,
      enabled: true,
      lastNotifiedAt: null,
      notificationClaimedAt: null,
      notificationCursorAt: now,
    },
    select: TARGET_PRICE_WATCH_SELECT,
  });

  return {
    status: "saved",
    product,
    watch,
    currentPrice,
    currency,
    capturedAt: product.currentPrice.priceSnapshot.capturedAt,
    reached: currentPrice <= targetPrice,
  };
}

async function countActiveTargetPriceWatches({
  client,
  discordUserId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<number> {
  const watches = await client.discordTargetPriceWatch.findMany({
    where: {
      discordUserId,
      enabled: true,
    },
    select: {
      id: true,
    },
    take: MAX_TARGET_PRICE_WATCHES_PER_USER,
  });

  return watches.length;
}

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

function normalizeWatchStatusFilter(
  statusFilter: TargetPriceWatchStatusFilter,
): TargetPriceWatchStatusFilter {
  return statusFilter === "reached" || statusFilter === "unreached" ? statusFilter : "all";
}

function normalizeWatchSortKey(sortKey: TargetPriceWatchSortKey): TargetPriceWatchSortKey {
  return sortKey === "target" || sortKey === "current" ? sortKey : "recent";
}

function matchesWatchStatusFilter(
  watch: TargetPriceWatchListRecord,
  statusFilter: TargetPriceWatchStatusFilter,
): boolean {
  if (statusFilter === "all") {
    return true;
  }

  const reached = isWatchTargetReached(watch);

  return statusFilter === "reached" ? reached : !reached;
}

function sortTargetPriceWatches(
  watches: TargetPriceWatchListRecord[],
  sortKey: TargetPriceWatchSortKey,
): TargetPriceWatchListRecord[] {
  const sortedWatches = [...watches];

  if (sortKey === "target") {
    return sortedWatches.sort(
      (left, right) =>
        left.targetPrice - right.targetPrice ||
        right.updatedAt.getTime() - left.updatedAt.getTime() ||
        left.id.localeCompare(right.id),
    );
  }

  if (sortKey === "current") {
    return sortedWatches.sort((left, right) => {
      const leftPrice = getWatchCurrentPrice(left);
      const rightPrice = getWatchCurrentPrice(right);

      if (leftPrice === null && rightPrice === null) {
        return left.id.localeCompare(right.id);
      }

      if (leftPrice === null) {
        return 1;
      }

      if (rightPrice === null) {
        return -1;
      }

      return leftPrice - rightPrice || left.id.localeCompare(right.id);
    });
  }

  return sortedWatches.sort(
    (left, right) =>
      right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id),
  );
}

function isWatchTargetReached(watch: TargetPriceWatchListRecord): boolean {
  const currentPrice = getWatchCurrentPrice(watch);

  return currentPrice !== null && currentPrice <= watch.targetPrice;
}

function getWatchCurrentPrice(watch: TargetPriceWatchListRecord): number | null {
  return watch.product.currentPrice?.priceSnapshot.price ?? null;
}

function formatWatchListState({
  page,
  statusFilter,
  sortKey,
}: {
  page: number;
  statusFilter: TargetPriceWatchStatusFilter;
  sortKey: TargetPriceWatchSortKey;
}): string {
  return `${page}:${statusFilter}:${sortKey}`;
}

function formatWatchListDisplayState(result: TargetPriceWatchlistResult): string {
  return `顯示：${formatWatchStatusFilterLabel(result.statusFilter)}；排序：${formatWatchSortLabel(
    result.sortKey,
  )}；符合 ${result.filteredCount}/${result.totalCount} 項`;
}

function formatWatchStatusFilterLabel(statusFilter: TargetPriceWatchStatusFilter): string {
  if (statusFilter === "reached") {
    return "已達標";
  }

  if (statusFilter === "unreached") {
    return "未達標";
  }

  return "全部";
}

function formatWatchSortLabel(sortKey: TargetPriceWatchSortKey): string {
  if (sortKey === "target") {
    return "目標價低到高";
  }

  if (sortKey === "current") {
    return "目前價格低到高";
  }

  return "最近更新";
}

export async function disableTargetPriceWatch({
  client,
  discordUserId,
  watchInput,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  watchInput: string | null;
}): Promise<DisableTargetPriceWatchResult> {
  const result = await readTargetPriceWatch({
    client,
    discordUserId,
    watchInput,
  });

  if (result.status !== "found") {
    return result;
  }

  return disableTargetPriceWatchRecord({
    client,
    discordUserId,
    watch: result.watch,
  });
}

export async function disableTargetPriceWatches({
  client,
  discordUserId,
  watchInputs,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  watchInputs: string[];
}): Promise<DisableTargetPriceWatchesResult> {
  const uniqueWatchInputs = [...new Set(watchInputs)];
  let disabledCount = 0;
  let unavailableCount = 0;

  for (const watchInput of uniqueWatchInputs) {
    const result = await disableTargetPriceWatch({
      client,
      discordUserId,
      watchInput,
    });

    if (result.status === "disabled") {
      disabledCount += 1;
    } else {
      unavailableCount += 1;
    }
  }

  return {
    disabledCount,
    unavailableCount,
  };
}

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

export async function updateTargetPriceWatch({
  client,
  discordUserId,
  watchInput,
  targetPrice,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  watchInput: string | null;
  targetPrice: number | null;
  now?: Date;
}): Promise<UpdateTargetPriceWatchResult> {
  if (
    !targetPrice ||
    !Number.isInteger(targetPrice) ||
    targetPrice < 1 ||
    targetPrice > MAX_TARGET_PRICE
  ) {
    return {
      status: "invalid_target_price",
    };
  }

  const result = await readTargetPriceWatch({
    client,
    discordUserId,
    watchInput,
  });

  if (result.status !== "found") {
    return result;
  }

  const updateResult = await client.discordTargetPriceWatch.updateMany({
    where: {
      id: result.watch.id,
      discordUserId,
      enabled: true,
    },
    data: {
      targetPrice,
      lastNotifiedAt: null,
      notificationClaimedAt: null,
      notificationCursorAt: now,
    },
  });

  return updateResult.count === 0
    ? { status: "not_found" }
    : {
        status: "updated",
        watch: {
          ...result.watch,
          targetPrice,
          lastNotifiedAt: null,
          notificationCursorAt: now,
        },
      };
}

export async function readTargetPriceWatch({
  client,
  discordUserId,
  watchInput,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  watchInput: string | null;
}): Promise<TargetPriceWatchLookupResult> {
  const watchId = normalizeWatchId(watchInput);

  if (!watchId) {
    return {
      status: "invalid_reference",
    };
  }

  const watch = await client.discordTargetPriceWatch.findFirst({
    where: {
      id: watchId,
      discordUserId,
      enabled: true,
    },
    select: TARGET_PRICE_WATCH_LIST_SELECT,
  });

  if (!watch) {
    return {
      status: "not_found",
    };
  }

  return {
    status: "found",
    watch,
  };
}

export async function readLatestTargetPriceWatchDelivery({
  client,
  discordUserId,
  watchId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  watchId: string;
}): Promise<TargetPriceWatchDeliveryStatus | null> {
  return client.discordNotificationDelivery.findFirst({
    where: {
      discordUserId,
      kind: "TARGET_PRICE",
      targetPriceWatchId: watchId,
    },
    select: TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

async function disableTargetPriceWatchRecord({
  client,
  discordUserId,
  watch,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  watch: TargetPriceWatchListRecord;
}): Promise<DisableTargetPriceWatchResult> {
  const result = await client.discordTargetPriceWatch.updateMany({
    where: {
      id: watch.id,
      discordUserId,
      enabled: true,
    },
    data: {
      enabled: false,
    },
  });

  if (result.count === 0) {
    return { status: "not_found" };
  }

  return {
    status: "disabled",
    watch,
  };
}

export function createTargetPriceWatchResponseMessage({
  result,
  publicBaseUrl,
}: {
  result: CreateTargetPriceWatchResult;
  publicBaseUrl: string;
}): DiscordBotMessage {
  if (result.status === "invalid_product_reference") {
    return {
      content:
        "無法辨識商品。請貼上 PartsRadarTW 商品頁完整網址，或輸入網址 `/products/` 後面的商品 ID。",
    };
  }

  if (result.status === "invalid_target_price") {
    return {
      content: `目標價格需為 1-${MAX_TARGET_PRICE.toLocaleString("en-US")} 的新台幣整數，請不要輸入 NT$、逗號或空格。`,
    };
  }

  if (result.status === "product_not_found") {
    return {
      content: "找不到可追蹤的商品。請確認商品頁網址或商品 ID 正確，且該商品目前仍有價格資料。",
    };
  }

  if (result.status === "watch_limit_reached") {
    return {
      content: `你已達到最多 ${result.maxWatches} 個商品追蹤。請先在 /watch 移除不需要的追蹤，再新增商品。`,
    };
  }

  const productName = formatDiscordBotText(result.product.name, PRODUCT_NAME_MAX_LENGTH);
  const targetDelta = result.currentPrice - result.watch.targetPrice;
  const status = result.reached
    ? "目前價格已低於或等於目標價。"
    : `尚未達標，距離目標價還差 ${formatTaiwanDollar(targetDelta, result.currency)}。`;

  return {
    embeds: [
      {
        title: "已儲存商品目標價",
        description: `[${escapeMarkdownLinkText(productName)}](${createProductUrl(
          publicBaseUrl,
          result.product.id,
        )})`,
        color: DISCORD_EMBED_COLOR,
        fields: [
          {
            name: "目前價格",
            value: formatTaiwanDollar(result.currentPrice, result.currency),
            inline: true,
          },
          {
            name: "目標價格",
            value: formatTaiwanDollar(result.watch.targetPrice, result.watch.currency),
            inline: true,
          },
          {
            name: "追蹤狀態",
            value: status,
          },
        ],
        footer: {
          text: `價格資料時間：${formatTaipeiMinute(result.capturedAt)}`,
        },
      },
    ],
  };
}

export function createTargetPriceWatchManagerMessage({
  result,
  publicBaseUrl,
  selectedWatchInput = null,
  selectedWatchDelivery = null,
  notice,
}: {
  result: TargetPriceWatchlistResult;
  publicBaseUrl: string;
  selectedWatchInput?: string | null;
  selectedWatchDelivery?: TargetPriceWatchDeliveryStatus | null;
  notice?: string;
}): DiscordBotMessage {
  const selectedWatchId = normalizeWatchId(selectedWatchInput);
  const selectedWatch = result.watches.find((watch) => watch.id === selectedWatchId) ?? null;
  const state = formatWatchListState(result);
  const managerState = selectedWatch
    ? `**目前選取的商品**\n[${escapeMarkdownLinkText(
        formatDiscordBotText(selectedWatch.product.name, PRODUCT_NAME_MAX_LENGTH),
      )}](${createProductUrl(publicBaseUrl, selectedWatch.product.id)})\n\n可編輯目標價或移除追蹤。`
    : result.filteredCount > 0
      ? "**你的追蹤清單**\n從選單選商品查看或管理。"
      : result.totalCount > 0
        ? "**你的追蹤清單**\n目前篩選沒有符合商品，可調整篩選條件。"
        : "**你的追蹤清單**\n尚未追蹤商品，請按「新增追蹤」。";
  const description = [
    notice ? `**${notice}**` : null,
    WATCH_MANAGER_GUIDE,
    result.totalCount > 0 ? formatWatchListDisplayState(result) : null,
    managerState,
  ]
    .filter((section): section is string => section !== null)
    .join("\n\n");
  const components: NonNullable<DiscordBotMessage["components"]> = [];

  if (result.watches.length > 0) {
    components.push({
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: `${WATCH_SELECT_CUSTOM_ID_PREFIX}${state}`,
          placeholder: "選擇要管理的商品",
          min_values: 1,
          max_values: 1,
          options: result.watches.map((watch) =>
            formatWatchSelectOption(watch, watch.id === selectedWatch?.id),
          ),
        },
      ],
    });
  }

  if (result.totalCount > 0) {
    components.push({
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: `${WATCH_FILTER_CUSTOM_ID_PREFIX}${state}`,
          placeholder: "篩選追蹤狀態",
          min_values: 1,
          max_values: 1,
          options: [
            {
              label: "全部",
              value: "all",
              description: "顯示所有目標價追蹤",
              default: result.statusFilter === "all" || undefined,
            },
            {
              label: "已達標",
              value: "reached",
              description: "目前價格低於或等於目標價",
              default: result.statusFilter === "reached" || undefined,
            },
            {
              label: "未達標",
              value: "unreached",
              description: "尚未達標或目前價格未知",
              default: result.statusFilter === "unreached" || undefined,
            },
          ],
        },
      ],
    });
    components.push({
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: `${WATCH_SORT_CUSTOM_ID_PREFIX}${state}`,
          placeholder: "調整排序",
          min_values: 1,
          max_values: 1,
          options: [
            {
              label: "最近更新",
              value: "recent",
              description: "最近修改的追蹤排在前面",
              default: result.sortKey === "recent" || undefined,
            },
            {
              label: "目標價低到高",
              value: "target",
              description: "依設定的目標價格排序",
              default: result.sortKey === "target" || undefined,
            },
            {
              label: "目前價格低到高",
              value: "current",
              description: "目前價格未知會排在最後",
              default: result.sortKey === "current" || undefined,
            },
          ],
        },
      ],
    });
  }

  const actionButtons: DiscordButtonComponent[] = [
    {
      type: DISCORD_COMPONENT_TYPE_BUTTON,
      style: DISCORD_BUTTON_STYLE_PRIMARY,
      custom_id: WATCH_ADD_CUSTOM_ID,
      label: "新增追蹤",
    },
    {
      type: DISCORD_COMPONENT_TYPE_BUTTON,
      style: DISCORD_BUTTON_STYLE_SECONDARY,
      custom_id: selectedWatch
        ? `${WATCH_EDIT_CUSTOM_ID_PREFIX}${selectedWatch.id}:${selectedWatch.targetPrice}:${state}`
        : `${WATCH_EDIT_CUSTOM_ID_PREFIX}none:0:${state}`,
      label: "編輯目標價",
      disabled: selectedWatch === null,
    },
    {
      type: DISCORD_COMPONENT_TYPE_BUTTON,
      style: DISCORD_BUTTON_STYLE_DANGER,
      custom_id: selectedWatch
        ? `${WATCH_REMOVE_CUSTOM_ID_PREFIX}${selectedWatch.id}:${state}`
        : `${WATCH_REMOVE_CUSTOM_ID_PREFIX}none:${state}`,
      label: "移除追蹤",
      disabled: selectedWatch === null,
    },
  ];

  if (result.watches.length > 0) {
    actionButtons.push({
      type: DISCORD_COMPONENT_TYPE_BUTTON,
      style: DISCORD_BUTTON_STYLE_DANGER,
      custom_id: `${WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX}${state}`,
      label: "批次移除",
    });
  }

  actionButtons.push({
    type: DISCORD_COMPONENT_TYPE_BUTTON,
    style: DISCORD_BUTTON_STYLE_SECONDARY,
    custom_id: `${WATCH_REFRESH_CUSTOM_ID_PREFIX}${state}`,
    label: "重新整理",
  });

  components.push({
    type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
    components: actionButtons,
  });

  if (result.hasPreviousPage || result.hasNextPage) {
    components.push({
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: `${WATCH_PAGE_CUSTOM_ID_PREFIX}${formatWatchListState({
            page: Math.max(0, result.page - 1),
            statusFilter: result.statusFilter,
            sortKey: result.sortKey,
          })}`,
          label: "上一頁",
          disabled: !result.hasPreviousPage,
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: `${WATCH_PAGE_CUSTOM_ID_PREFIX}${formatWatchListState({
            page: result.page + 1,
            statusFilter: result.statusFilter,
            sortKey: result.sortKey,
          })}`,
          label: "下一頁",
          disabled: !result.hasNextPage,
        },
      ],
    });
  }

  return {
    embeds: [
      {
        title: "商品目標價追蹤",
        description,
        color: DISCORD_EMBED_COLOR,
        fields: selectedWatch
          ? formatWatchSummaryFields(selectedWatch, selectedWatchDelivery)
          : undefined,
        footer: {
          text: `第 ${result.page + 1} 頁，每頁最多 ${WATCH_MANAGER_PAGE_SIZE} 筆`,
        },
      },
    ],
    components,
  };
}

export function createTargetPriceWatchBulkRemovalMessage({
  result,
  page,
}: {
  result: TargetPriceWatchlistResult;
  page: number;
}): DiscordBotMessage {
  const state = formatWatchListState({
    page,
    statusFilter: result.statusFilter,
    sortKey: result.sortKey,
  });

  if (result.watches.length === 0) {
    return {
      embeds: [
        {
          title: "批次移除目標價追蹤",
          description: "目前沒有可移除的追蹤商品。",
          color: DISCORD_EMBED_COLOR,
        },
      ],
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
          components: [
            {
              type: DISCORD_COMPONENT_TYPE_BUTTON,
              style: DISCORD_BUTTON_STYLE_SECONDARY,
              custom_id: `${WATCH_REFRESH_CUSTOM_ID_PREFIX}${state}`,
              label: "返回設定",
            },
          ],
        },
      ],
    };
  }

  return {
    embeds: [
      {
        title: "批次移除目標價追蹤",
        description: "從下方清單選擇要移除的商品。送出選擇後會先顯示確認頁，按下確認後才會移除。",
        color: DISCORD_EMBED_COLOR,
        footer: {
          text: `第 ${result.page + 1} 頁，每頁最多 ${WATCH_MANAGER_PAGE_SIZE} 筆`,
        },
      },
    ],
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
        components: [
          {
            type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
            custom_id: `${WATCH_BULK_REMOVE_SELECT_CUSTOM_ID_PREFIX}${formatWatchListState(result)}`,
            placeholder: "選擇要批次移除的商品",
            min_values: 1,
            max_values: result.watches.length,
            options: result.watches.map((watch) => formatWatchSelectOption(watch, false)),
          },
        ],
      },
      {
        type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
        components: [
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_SECONDARY,
            custom_id: `${WATCH_REFRESH_CUSTOM_ID_PREFIX}${state}`,
            label: "返回設定",
          },
        ],
      },
    ],
  };
}

export function createTargetPriceWatchBulkRemovalConfirmationMessage({
  result,
  selectedWatchInputs,
  publicBaseUrl,
  token,
}: {
  result: TargetPriceWatchlistResult;
  selectedWatchInputs: string[];
  publicBaseUrl: string;
  token: string;
}): DiscordBotMessage {
  const selectedWatchIds = new Set(
    selectedWatchInputs
      .map((watchInput) => normalizeWatchId(watchInput))
      .filter((watchId): watchId is string => watchId !== null),
  );
  const selectedWatches = result.watches.filter((watch) => selectedWatchIds.has(watch.id));
  const descriptionLines =
    selectedWatches.length > 0
      ? selectedWatches.map((watch) => {
          const productName = formatDiscordBotText(watch.product.name, PRODUCT_NAME_MAX_LENGTH);

          return `- [${escapeMarkdownLinkText(productName)}](${createProductUrl(
            publicBaseUrl,
            watch.product.id,
          )})`;
        })
      : ["找不到這批追蹤，請返回設定重新整理。"];

  return {
    embeds: [
      {
        title: "確認批次移除目標價追蹤",
        description: [
          `你即將移除 ${selectedWatches.length} 項目標價追蹤：`,
          "",
          ...descriptionLines,
          "",
          "按下「確認移除」後才會生效。",
        ].join("\n"),
        color: DISCORD_EMBED_COLOR,
      },
    ],
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
        components: [
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_DANGER,
            custom_id: `${WATCH_BULK_REMOVE_CONFIRM_CUSTOM_ID_PREFIX}${token}`,
            label: "確認移除",
            disabled: selectedWatches.length === 0,
          },
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_SECONDARY,
            custom_id: `${WATCH_BULK_REMOVE_CANCEL_CUSTOM_ID_PREFIX}${token}`,
            label: "返回設定",
          },
        ],
      },
    ],
  };
}

export function createTargetPriceWatchRemovalConfirmationMessage({
  result,
  publicBaseUrl,
  page,
  statusFilter = "all",
  sortKey = "recent",
}: {
  result: TargetPriceWatchLookupResult;
  publicBaseUrl: string;
  page: number;
  statusFilter?: TargetPriceWatchStatusFilter;
  sortKey?: TargetPriceWatchSortKey;
}): DiscordBotMessage {
  if (result.status === "invalid_reference") {
    return {
      content: "無法辨識要移除的商品，請重新執行 `/watch` 並從清單選擇。",
    };
  }

  if (result.status === "not_found") {
    return {
      content: "這項追蹤可能已被移除，請重新執行 `/watch` 取得最新清單。",
    };
  }

  const productName = formatDiscordBotText(result.watch.product.name, PRODUCT_NAME_MAX_LENGTH);
  const state = formatWatchListState({ page, statusFilter, sortKey });

  return {
    embeds: [
      {
        title: "確認移除目標價追蹤",
        description: `你即將移除以下商品的目標價追蹤：\n\n[${escapeMarkdownLinkText(productName)}](${createProductUrl(
          publicBaseUrl,
          result.watch.product.id,
        )})\n\n移除後，這項商品將不再出現在你的追蹤清單。`,
        color: DISCORD_EMBED_COLOR,
        fields: formatWatchSummaryFields(result.watch),
        footer: {
          text: "商品資料不會被刪除；按下「確認移除」後才會生效。",
        },
      },
    ],
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
        components: [
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_DANGER,
            custom_id: `${WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX}${result.watch.id}:${state}`,
            label: "確認移除",
          },
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_SECONDARY,
            custom_id: `${WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX}${result.watch.id}:${state}`,
            label: "返回設定",
          },
        ],
      },
    ],
  };
}

export function normalizeWatchProductReference(value: string): string | null {
  const input = value.trim();
  const normalizedDirectId = normalizeProductId(input);

  if (normalizedDirectId) {
    return normalizedDirectId;
  }

  const pathProductId = extractProductIdFromPath(input);

  if (pathProductId) {
    return pathProductId;
  }

  try {
    return extractProductIdFromPath(new URL(input).pathname);
  } catch {
    return null;
  }
}

function normalizeWatchId(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  const unprefixed = normalized.startsWith(WATCH_SELECT_VALUE_PREFIX)
    ? normalized.slice(WATCH_SELECT_VALUE_PREFIX.length)
    : normalized;

  return UUID_PATTERN.test(unprefixed) ? unprefixed : null;
}

function formatWatchSelectOption(
  watch: TargetPriceWatchListRecord,
  selected: boolean,
): {
  label: string;
  value: string;
  description: string;
  default?: boolean;
} {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price ?? null;
  const currentCurrency = watch.product.currentPrice?.priceSnapshot.currency ?? watch.currency;
  const currentPriceLabel =
    currentPrice === null ? "目前價格未知" : formatTaiwanDollar(currentPrice, currentCurrency);
  const productName = toSingleLine(watch.product.name);

  return {
    label: formatDiscordBotText(productName, WATCH_SELECT_LABEL_MAX_LENGTH),
    value: `${WATCH_SELECT_VALUE_PREFIX}${watch.id}`,
    description: formatDiscordBotText(
      `${currentPriceLabel} / 目標 ${formatTaiwanDollar(watch.targetPrice, watch.currency)}`,
      WATCH_SELECT_DESCRIPTION_MAX_LENGTH,
    ),
    default: selected || undefined,
  };
}

function formatWatchSummaryFields(
  watch: TargetPriceWatchListRecord,
  delivery: TargetPriceWatchDeliveryStatus | null = null,
): Array<{
  name: string;
  value: string;
  inline?: boolean;
}> {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price ?? null;
  const currentCurrency = watch.product.currentPrice?.priceSnapshot.currency ?? watch.currency;
  const priceSeenAt =
    watch.product.currentPrice?.lastSeenAt ??
    watch.product.currentPrice?.priceSnapshot.capturedAt ??
    null;

  const fields = [
    {
      name: "目前價格",
      value:
        currentPrice === null ? "目前價格未知" : formatTaiwanDollar(currentPrice, currentCurrency),
      inline: true,
    },
    {
      name: "價格資料時間",
      value: priceSeenAt ? formatTaipeiMinute(priceSeenAt) : "尚無價格資料",
      inline: true,
    },
    {
      name: "目標價格",
      value: formatTaiwanDollar(watch.targetPrice, watch.currency),
      inline: true,
    },
    {
      name: "追蹤狀態",
      value: formatWatchStatus({
        currentPrice,
        targetPrice: watch.targetPrice,
        currency: currentCurrency,
        lastNotifiedAt: watch.lastNotifiedAt,
      }),
    },
  ];
  const deliveryField = formatWatchNotificationDeliveryField(delivery);

  return deliveryField ? [...fields, deliveryField] : fields;
}

function formatWatchNotificationDeliveryField(
  delivery: TargetPriceWatchDeliveryStatus | null,
): { name: string; value: string } | null {
  if (!delivery || delivery.status === "SENT") {
    return null;
  }

  const happenedAt = formatTaipeiMinute(delivery.deliveredAt ?? delivery.createdAt);

  if (delivery.status === "RATE_LIMITED") {
    return {
      name: "最近一次通知",
      value: `限流：${happenedAt}。\n${formatDiscordRateLimitForUser()}`,
    };
  }

  if (delivery.status === "FAILED") {
    return {
      name: "最近一次通知",
      value: `失敗：${happenedAt}。\n${formatDiscordDeliveryFailureForUser(delivery.errorMessage)}`,
    };
  }

  return null;
}

function formatWatchStatus({
  currentPrice,
  targetPrice,
  currency,
  lastNotifiedAt,
}: {
  currentPrice: number | null;
  targetPrice: number;
  currency: string;
  lastNotifiedAt: Date | null;
}): string {
  if (currentPrice === null) {
    return "等待商品價格資料更新。";
  }

  if (currentPrice <= targetPrice) {
    return lastNotifiedAt
      ? "已達到目標價格，且已發送通知。"
      : "已達到目標價格；目前價格低於或等於目標價。";
  }

  return `尚未達標；目前價格仍高於目標價 ${formatTaiwanDollar(currentPrice - targetPrice, currency)}。`;
}

function extractProductIdFromPath(value: string): string | null {
  const match = value.match(/(?:^|\/)products\/([^/?#]+)/i);

  if (!match?.[1]) {
    return null;
  }

  let candidate: string;

  try {
    candidate = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  return normalizeProductId(candidate);
}

function normalizeProductId(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

function formatTaipeiMinute(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("month")}/${byType.get("day")} ${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}

function formatTaiwanDollar(amount: number, currency: string): string {
  if (currency === "TWD") {
    return `NT$${amount.toLocaleString("en-US")}`;
  }

  return `${currency} ${amount.toLocaleString("en-US")}`;
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[[\]\\]/g, "\\$&");
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
