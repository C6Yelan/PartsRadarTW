// apps/crawler/src/scripts/ops/discord-bot/watch.ts

import type { Prisma } from "@partsradar/db";

import { DISCORD_EMBED_COLOR, MAX_TARGET_PRICE, PRODUCT_NAME_MAX_LENGTH } from "./constants";
import { formatDiscordBotText } from "./rest";
import type { DiscordBotClient, DiscordBotMessage } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

type TargetPriceWatchProductRecord = Prisma.ProductGetPayload<{
  select: typeof TARGET_PRICE_WATCH_PRODUCT_SELECT;
}>;
type SavedTargetPriceWatchRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_SELECT;
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
