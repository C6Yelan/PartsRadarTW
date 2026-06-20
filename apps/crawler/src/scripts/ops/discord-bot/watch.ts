// apps/crawler/src/scripts/ops/discord-bot/watch.ts

import type { Prisma } from "@partsradar/db";
import {
  WATCH_ADD_CUSTOM_ID,
  WATCH_EDIT_CUSTOM_ID_PREFIX,
  WATCH_PAGE_CUSTOM_ID_PREFIX,
  WATCH_REFRESH_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_SELECT_CUSTOM_ID_PREFIX,
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
  PRODUCT_NAME_MAX_LENGTH,
} from "./constants";
import { formatDiscordBotText } from "./rest";
import type { DiscordBotClient, DiscordBotMessage } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WATCH_SELECT_VALUE_PREFIX = "watch:";
const WATCH_MANAGER_PAGE_SIZE = 25;
const WATCH_SELECT_LABEL_MAX_LENGTH = 100;
const WATCH_SELECT_DESCRIPTION_MAX_LENGTH = 100;

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
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

const TARGET_PRICE_WATCH_LIST_SELECT = {
  id: true,
  discordUserId: true,
  productId: true,
  targetPrice: true,
  currency: true,
  enabled: true,
  lastNotifiedAt: true,
  updatedAt: true,
  product: {
    select: TARGET_PRICE_WATCH_PRODUCT_SELECT,
  },
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

type TargetPriceWatchProductRecord = Prisma.ProductGetPayload<{
  select: typeof TARGET_PRICE_WATCH_PRODUCT_SELECT;
}>;
type SavedTargetPriceWatchRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_SELECT;
}>;
type TargetPriceWatchListRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_LIST_SELECT;
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
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

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
}: {
  client: DiscordBotClient;
  discordUserId: string;
  productInput: string | null;
  targetPrice: number | null;
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
    },
    update: {
      targetPrice,
      currency,
      enabled: true,
      lastNotifiedAt: null,
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

export async function readTargetPriceWatchlist({
  client,
  discordUserId,
  page = 0,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  page?: number;
}): Promise<TargetPriceWatchlistResult> {
  const boundedPage = Number.isSafeInteger(page) && page > 0 ? page : 0;
  const watches = await client.discordTargetPriceWatch.findMany({
    where: {
      discordUserId,
      enabled: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: boundedPage * WATCH_MANAGER_PAGE_SIZE,
    take: WATCH_MANAGER_PAGE_SIZE + 1,
    select: TARGET_PRICE_WATCH_LIST_SELECT,
  });
  const listedWatches = watches.slice(0, WATCH_MANAGER_PAGE_SIZE);

  return {
    watches: listedWatches,
    page: boundedPage,
    hasPreviousPage: boundedPage > 0,
    hasNextPage: watches.length > WATCH_MANAGER_PAGE_SIZE,
  };
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

export async function updateTargetPriceWatch({
  client,
  discordUserId,
  watchInput,
  targetPrice,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  watchInput: string | null;
  targetPrice: number | null;
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
      content: "請輸入 PartsRadarTW 商品 ID 或商品頁 URL。",
    };
  }

  if (result.status === "invalid_target_price") {
    return {
      content: `目標價格需為 1-${MAX_TARGET_PRICE.toLocaleString("en-US")} 的整數。`,
    };
  }

  if (result.status === "product_not_found") {
    return {
      content: "找不到可追蹤的商品。請確認商品 ID 或 PartsRadarTW 商品頁 URL 是否正確。",
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
        title: "已保存目標價追蹤",
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
            name: "狀態",
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
  notice,
}: {
  result: TargetPriceWatchlistResult;
  publicBaseUrl: string;
  selectedWatchInput?: string | null;
  notice?: string;
}): DiscordBotMessage {
  const selectedWatchId = normalizeWatchId(selectedWatchInput);
  const selectedWatch = result.watches.find((watch) => watch.id === selectedWatchId) ?? null;
  const managerDescription = selectedWatch
    ? `[${escapeMarkdownLinkText(
        formatDiscordBotText(selectedWatch.product.name, PRODUCT_NAME_MAX_LENGTH),
      )}](${createProductUrl(publicBaseUrl, selectedWatch.product.id)})`
    : result.watches.length > 0
      ? "從選單選擇商品後，即可編輯目標價格或移除追蹤。"
      : "目前沒有啟用中的目標價追蹤。";
  const description = notice ? `**${notice}**\n\n${managerDescription}` : managerDescription;
  const components: NonNullable<DiscordBotMessage["components"]> = [];

  if (result.watches.length > 0) {
    components.push({
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: `${WATCH_SELECT_CUSTOM_ID_PREFIX}${result.page}`,
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

  components.push({
    type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
    components: [
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
          ? `${WATCH_EDIT_CUSTOM_ID_PREFIX}${selectedWatch.id}:${selectedWatch.targetPrice}:${result.page}`
          : `${WATCH_EDIT_CUSTOM_ID_PREFIX}none:0:${result.page}`,
        label: "編輯目標價",
        disabled: selectedWatch === null,
      },
      {
        type: DISCORD_COMPONENT_TYPE_BUTTON,
        style: DISCORD_BUTTON_STYLE_DANGER,
        custom_id: selectedWatch
          ? `${WATCH_REMOVE_CUSTOM_ID_PREFIX}${selectedWatch.id}:${result.page}`
          : `${WATCH_REMOVE_CUSTOM_ID_PREFIX}none:${result.page}`,
        label: "移除追蹤",
        disabled: selectedWatch === null,
      },
      {
        type: DISCORD_COMPONENT_TYPE_BUTTON,
        style: DISCORD_BUTTON_STYLE_SECONDARY,
        custom_id: `${WATCH_REFRESH_CUSTOM_ID_PREFIX}${result.page}`,
        label: "重新整理",
      },
    ],
  });

  if (result.hasPreviousPage || result.hasNextPage) {
    components.push({
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: `${WATCH_PAGE_CUSTOM_ID_PREFIX}${Math.max(0, result.page - 1)}`,
          label: "上一頁",
          disabled: !result.hasPreviousPage,
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: `${WATCH_PAGE_CUSTOM_ID_PREFIX}${result.page + 1}`,
          label: "下一頁",
          disabled: !result.hasNextPage,
        },
      ],
    });
  }

  return {
    embeds: [
      {
        title: "目標價追蹤設定",
        description,
        color: DISCORD_EMBED_COLOR,
        fields: selectedWatch ? formatWatchSummaryFields(selectedWatch) : undefined,
        footer: {
          text: `第 ${result.page + 1} 頁，每頁最多 ${WATCH_MANAGER_PAGE_SIZE} 筆`,
        },
      },
    ],
    components,
  };
}

export function createTargetPriceWatchRemovalConfirmationMessage({
  result,
  publicBaseUrl,
  page,
}: {
  result: TargetPriceWatchLookupResult;
  publicBaseUrl: string;
  page: number;
}): DiscordBotMessage {
  if (result.status === "invalid_reference") {
    return {
      content: "無法辨識要移除的追蹤項目，請重新執行 `/watch`。",
    };
  }

  if (result.status === "not_found") {
    return {
      content: "找不到啟用中的目標價追蹤，請重新執行 `/watch`。",
    };
  }

  const productName = formatDiscordBotText(result.watch.product.name, PRODUCT_NAME_MAX_LENGTH);

  return {
    embeds: [
      {
        title: "確認移除目標價追蹤",
        description: `[${escapeMarkdownLinkText(productName)}](${createProductUrl(
          publicBaseUrl,
          result.watch.product.id,
        )})`,
        color: DISCORD_EMBED_COLOR,
        fields: formatWatchSummaryFields(result.watch),
        footer: {
          text: "按下確認後才會移除追蹤。",
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
            custom_id: `${WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX}${result.watch.id}:${page}`,
            label: "確認移除",
          },
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_SECONDARY,
            custom_id: `${WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX}${result.watch.id}:${page}`,
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

function formatWatchSummaryFields(watch: TargetPriceWatchListRecord): Array<{
  name: string;
  value: string;
  inline?: boolean;
}> {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price ?? null;
  const currentCurrency = watch.product.currentPrice?.priceSnapshot.currency ?? watch.currency;

  return [
    {
      name: "目前價格",
      value:
        currentPrice === null ? "目前價格未知" : formatTaiwanDollar(currentPrice, currentCurrency),
      inline: true,
    },
    {
      name: "目標價格",
      value: formatTaiwanDollar(watch.targetPrice, watch.currency),
      inline: true,
    },
    {
      name: "狀態",
      value: formatWatchStatus({
        currentPrice,
        targetPrice: watch.targetPrice,
        currency: currentCurrency,
        lastNotifiedAt: watch.lastNotifiedAt,
      }),
    },
  ];
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
    return "待更新";
  }

  if (currentPrice <= targetPrice) {
    return lastNotifiedAt ? "已達標並通知" : "已達標";
  }

  return `尚差 ${formatTaiwanDollar(currentPrice - targetPrice, currency)}`;
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
