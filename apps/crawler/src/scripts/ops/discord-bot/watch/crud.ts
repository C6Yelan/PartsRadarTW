// apps/crawler/src/scripts/ops/discord-bot/watch/crud.ts

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
