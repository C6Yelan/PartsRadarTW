// apps/crawler/src/scripts/ops/discord-bot/watch/crud.ts
// 提供目標價 watch 的建立、讀取、更新與停用操作，所有寫入都以 Discord 使用者隔離。

import { MAX_TARGET_PRICE, MAX_TARGET_PRICE_WATCHES_PER_USER } from "../constants";
import type { DiscordBotClient } from "../types";
import {
  type CreateTargetPriceWatchResult,
  type DisableTargetPriceWatchResult,
  TARGET_PRICE_WATCH_LIST_SELECT,
  TARGET_PRICE_WATCH_PRODUCT_SELECT,
  TARGET_PRICE_WATCH_SELECT,
  type TargetPriceWatchListRecord,
  type TargetPriceWatchLookupResult,
  type UpdateTargetPriceWatchResult,
} from "./records";
import { normalizeWatchId, normalizeWatchProductReference } from "./reference";

// 建立目標價 watch；若同一商品已有停用或既有 watch，會用 upsert 更新並重新啟用。
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

  if (!isValidTargetPrice(targetPrice)) {
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
    capturedAt: product.currentPrice.priceSnapshot.capturedAt,
    reached: currentPrice <= targetPrice,
  };
}

// 停用單一 watch；用 soft delete 保留歷史與 delivery 關聯。
export async function disableTargetPriceWatch({
  client,
  discordUserId,
  targetPriceWatchInput,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  targetPriceWatchInput: string | null;
}): Promise<DisableTargetPriceWatchResult> {
  const result = await readTargetPriceWatch({
    client,
    discordUserId,
    targetPriceWatchInput,
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

// 更新既有 watch 的目標價，並重設通知游標避免用舊價格立即觸發通知。
export async function updateTargetPriceWatch({
  client,
  discordUserId,
  targetPriceWatchInput,
  targetPrice,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  targetPriceWatchInput: string | null;
  targetPrice: number | null;
  now?: Date;
}): Promise<UpdateTargetPriceWatchResult> {
  if (!isValidTargetPrice(targetPrice)) {
    return {
      status: "invalid_target_price",
    };
  }

  const result = await readTargetPriceWatch({
    client,
    discordUserId,
    targetPriceWatchInput,
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
        },
      };
}

// 依使用者輸入的 watch reference 讀取單筆啟用中的 watch。
export async function readTargetPriceWatch({
  client,
  discordUserId,
  targetPriceWatchInput,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  targetPriceWatchInput: string | null;
}): Promise<TargetPriceWatchLookupResult> {
  const watchId = normalizeWatchId(targetPriceWatchInput);

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

// 計算使用者目前啟用中的 watch 數量，用於新增不同商品前檢查每人上限。
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

// 執行單筆 watch soft delete，並回傳停用前的 watch 資料供回覆訊息使用。
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

function isValidTargetPrice(targetPrice: number | null): targetPrice is number {
  return (
    targetPrice !== null &&
    Number.isInteger(targetPrice) &&
    targetPrice >= 1 &&
    targetPrice <= MAX_TARGET_PRICE
  );
}
