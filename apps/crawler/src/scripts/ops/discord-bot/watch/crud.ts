// apps/crawler/src/scripts/ops/discord-bot/watch/crud.ts
// 提供目標價 watch 的讀取、更新與停用操作，所有寫入都以 Discord 使用者隔離。

import { MAX_TARGET_PRICE } from "../constants";
import type { DiscordBotClient } from "../types";
import { normalizeWatchId } from "./reference";
import {
  TARGET_PRICE_WATCH_LIST_SELECT,
  type DisableTargetPriceWatchResult,
  type DisableTargetPriceWatchesResult,
  type TargetPriceWatchListRecord,
  type TargetPriceWatchLookupResult,
  type UpdateTargetPriceWatchResult,
} from "./records";

export { createTargetPriceWatch } from "./crud/create";

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

// 僅供待移除的批次移除流程使用；新增功能不要再依賴此函式。
export async function disableTargetPriceWatches({
  client,
  discordUserId,
  targetPriceWatchInputs,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  targetPriceWatchInputs: string[];
}): Promise<DisableTargetPriceWatchesResult> {
  const uniqueWatchInputs = [...new Set(targetPriceWatchInputs)];
  let disabledCount = 0;
  let unavailableCount = 0;

  for (const targetPriceWatchInput of uniqueWatchInputs) {
    const result = await disableTargetPriceWatch({
      client,
      discordUserId,
      targetPriceWatchInput,
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
          lastNotifiedAt: null,
          notificationCursorAt: now,
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
