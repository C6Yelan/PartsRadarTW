// apps/crawler/src/scripts/ops/discord-bot/watch.ts

import type { Prisma } from "@partsradar/db";

import { DISCORD_EMBED_COLOR, MAX_TARGET_PRICE, PRODUCT_NAME_MAX_LENGTH } from "./constants";
import { formatDiscordBotText } from "./rest";
import type { DiscordBotClient, DiscordBotMessage } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WATCH_SHORT_ID_PATTERN = /^[0-9a-f]{8,36}$/i;
const MAX_WATCHLIST_ITEMS = 12;
const WATCHLIST_PRODUCT_NAME_MAX_LENGTH = 72;

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
  hiddenCount: number;
}

export type DisableTargetPriceWatchResult =
  | {
      status: "invalid_reference";
    }
  | {
      status: "not_found";
    }
  | {
      status: "ambiguous_reference";
    }
  | {
      status: "disabled";
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

  if (!targetPrice || !Number.isInteger(targetPrice) || targetPrice < 1 || targetPrice > MAX_TARGET_PRICE) {
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
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<TargetPriceWatchlistResult> {
  const watches = await client.discordTargetPriceWatch.findMany({
    where: {
      discordUserId,
      enabled: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: MAX_WATCHLIST_ITEMS + 1,
    select: TARGET_PRICE_WATCH_LIST_SELECT,
  });
  const listedWatches = watches.slice(0, MAX_WATCHLIST_ITEMS);

  return {
    watches: listedWatches,
    hiddenCount: Math.max(0, watches.length - listedWatches.length),
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
  if (!watchInput) {
    return {
      status: "invalid_reference",
    };
  }

  const productId = normalizeWatchProductReference(watchInput);

  if (productId) {
    return disableTargetPriceWatchByProductId({ client, discordUserId, productId });
  }

  const watchIdPrefix = normalizeWatchIdPrefix(watchInput);

  if (!watchIdPrefix) {
    return {
      status: "invalid_reference",
    };
  }

  const watches = await client.discordTargetPriceWatch.findMany({
    where: {
      discordUserId,
      enabled: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: TARGET_PRICE_WATCH_LIST_SELECT,
  });
  const matchingWatches = watches.filter((watch) => watch.id.toLowerCase().startsWith(watchIdPrefix));

  if (matchingWatches.length === 0) {
    return {
      status: "not_found",
    };
  }

  if (matchingWatches.length > 1) {
    return {
      status: "ambiguous_reference",
    };
  }

  return disableTargetPriceWatchRecord({
    client,
    discordUserId,
    watch: matchingWatches[0] as TargetPriceWatchListRecord,
  });
}

async function disableTargetPriceWatchByProductId({
  client,
  discordUserId,
  productId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  productId: string;
}): Promise<DisableTargetPriceWatchResult> {
  const watch = await client.discordTargetPriceWatch.findFirst({
    where: {
      discordUserId,
      productId,
      enabled: true,
    },
    select: TARGET_PRICE_WATCH_LIST_SELECT,
  });

  if (!watch) {
    return {
      status: "not_found",
    };
  }

  return disableTargetPriceWatchRecord({ client, discordUserId, watch });
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
  await client.discordTargetPriceWatch.updateMany({
    where: {
      id: watch.id,
      discordUserId,
      enabled: true,
    },
    data: {
      enabled: false,
    },
  });

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

export function createTargetPriceWatchlistResponseMessage({
  result,
  publicBaseUrl,
}: {
  result: TargetPriceWatchlistResult;
  publicBaseUrl: string;
}): DiscordBotMessage {
  if (result.watches.length === 0) {
    return {
      content: "目前沒有啟用中的目標價追蹤。可用 `/watch` 新增單一商品目標價。",
    };
  }

  const lines = result.watches.map((watch) => formatWatchlistLine({ watch, publicBaseUrl }));

  return {
    embeds: [
      {
        title: "目標價追蹤清單",
        description: lines.join("\n"),
        color: DISCORD_EMBED_COLOR,
        footer: {
          text: [
            "使用 /unwatch watch_id:<ID> 取消追蹤。",
            result.hiddenCount > 0 ? `另有 ${result.hiddenCount} 筆未顯示。` : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" "),
        },
      },
    ],
  };
}

export function createDisableTargetPriceWatchResponseMessage({
  result,
  publicBaseUrl,
}: {
  result: DisableTargetPriceWatchResult;
  publicBaseUrl: string;
}): DiscordBotMessage {
  if (result.status === "invalid_reference") {
    return {
      content: "請輸入 `/watchlist` 顯示的追蹤 ID，或 PartsRadarTW 商品 ID / 商品頁 URL。",
    };
  }

  if (result.status === "not_found") {
    return {
      content: "找不到啟用中的目標價追蹤。請用 `/watchlist` 查看目前清單。",
    };
  }

  if (result.status === "ambiguous_reference") {
    return {
      content: "追蹤 ID 不夠明確。請輸入 `/watchlist` 顯示的完整短 ID。",
    };
  }

  const productName = formatDiscordBotText(result.watch.product.name, PRODUCT_NAME_MAX_LENGTH);

  return {
    embeds: [
      {
        title: "已取消目標價追蹤",
        description: `[${escapeMarkdownLinkText(productName)}](${createProductUrl(
          publicBaseUrl,
          result.watch.product.id,
        )})`,
        color: DISCORD_EMBED_COLOR,
        fields: [
          {
            name: "追蹤 ID",
            value: formatWatchShortId(result.watch.id),
            inline: true,
          },
          {
            name: "目標價格",
            value: formatTaiwanDollar(result.watch.targetPrice, result.watch.currency),
            inline: true,
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

function normalizeWatchIdPrefix(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  return WATCH_SHORT_ID_PATTERN.test(normalized) ? normalized : null;
}

function formatWatchlistLine({
  watch,
  publicBaseUrl,
}: {
  watch: TargetPriceWatchListRecord;
  publicBaseUrl: string;
}): string {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price ?? null;
  const currentCurrency = watch.product.currentPrice?.priceSnapshot.currency ?? watch.currency;
  const status = formatWatchStatus({
    currentPrice,
    targetPrice: watch.targetPrice,
    currency: currentCurrency,
    lastNotifiedAt: watch.lastNotifiedAt,
  });
  const productName = escapeMarkdownLinkText(
    formatDiscordBotText(toSingleLine(watch.product.name), WATCHLIST_PRODUCT_NAME_MAX_LENGTH),
  );
  const currentPriceLabel =
    currentPrice === null ? "目前價格未知" : formatTaiwanDollar(currentPrice, currentCurrency);

  return formatDiscordBotText(
    `- \`${formatWatchShortId(watch.id)}\` **${currentPriceLabel}** / 目標 **${formatTaiwanDollar(
      watch.targetPrice,
      watch.currency,
    )}** / ${status} [${productName}](${createProductUrl(publicBaseUrl, watch.product.id)})`,
    320,
  );
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

function formatWatchShortId(watchId: string): string {
  return watchId.slice(0, 8);
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
