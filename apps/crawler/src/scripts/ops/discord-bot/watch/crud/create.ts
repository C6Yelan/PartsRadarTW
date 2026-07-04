// apps/crawler/src/scripts/ops/discord-bot/watch/crud/create.ts

import {
  MAX_TARGET_PRICE,
  MAX_TARGET_PRICE_WATCHES_PER_USER,
} from "../../constants";
import type { DiscordBotClient } from "../../types";
import { normalizeWatchProductReference } from "../reference";
import {
  TARGET_PRICE_WATCH_PRODUCT_SELECT,
  TARGET_PRICE_WATCH_SELECT,
  type CreateTargetPriceWatchResult,
} from "../records";

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
