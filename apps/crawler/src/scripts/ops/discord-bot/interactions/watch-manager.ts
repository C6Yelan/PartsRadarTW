// apps/crawler/src/scripts/ops/discord-bot/interactions/watch-manager.ts
import type { parseWatchModalSubmit } from "../commands";
import { MAX_TARGET_PRICE } from "../constants";
import type { DiscordBotClient, DiscordBotMessage } from "../types";
import {
  createTargetPriceWatchManagerMessage,
  readLatestTargetPriceWatchDelivery,
  readTargetPriceWatchlist,
} from "../watch";

export function formatWatchModalValidationMessage(
  modal: NonNullable<ReturnType<typeof parseWatchModalSubmit>>,
): string {
  const messages = [
    modal.action !== "create" || modal.productInputValid
      ? null
      : "請貼上 PartsRadarTW 商品頁完整網址，或輸入網址 `/products/` 後面的商品 ID。",
    modal.targetPriceInputValid
      ? null
      : `目標價格需為 1-${MAX_TARGET_PRICE.toLocaleString("en-US")} 的新台幣整數，請不要輸入 NT$、逗號或空格。`,
  ].filter((message): message is string => message !== null);

  return messages.join("\n");
}

export async function readWatchManagerPage({
  client,
  discordUserId,
  page,
  statusFilter = "all",
  sortKey = "recent",
}: {
  client: DiscordBotClient;
  discordUserId: string;
  page: number;
  statusFilter?: Parameters<typeof readTargetPriceWatchlist>[0]["statusFilter"];
  sortKey?: Parameters<typeof readTargetPriceWatchlist>[0]["sortKey"];
}) {
  const result = await readTargetPriceWatchlist({
    client,
    discordUserId,
    page,
    statusFilter,
    sortKey,
  });

  if (result.watches.length === 0 && result.hasPreviousPage) {
    return readWatchManagerPage({
      client,
      discordUserId,
      page: page - 1,
      statusFilter: result.statusFilter,
      sortKey: result.sortKey,
    });
  }

  return result;
}

export async function createTargetPriceWatchManagerMessageWithDelivery({
  client,
  discordUserId,
  result,
  publicBaseUrl,
  selectedWatchInput = null,
  notice,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  result: Awaited<ReturnType<typeof readWatchManagerPage>>;
  publicBaseUrl: string;
  selectedWatchInput?: string | null;
  notice?: string;
}): Promise<DiscordBotMessage> {
  const selectedWatchId = extractWatchId(selectedWatchInput);
  const selectedWatchDelivery =
    selectedWatchId && result.watches.some((watch) => watch.id === selectedWatchId)
      ? await readLatestTargetPriceWatchDelivery({
          client,
          discordUserId,
          watchId: selectedWatchId,
        })
      : null;

  return createTargetPriceWatchManagerMessage({
    result,
    publicBaseUrl,
    selectedWatchInput,
    selectedWatchDelivery,
    notice,
  });
}

export function extractWatchId(watchInput: string | null): string | null {
  const match = /^watch:([0-9a-f-]{36})$/i.exec(watchInput ?? "");

  return match?.[1] ?? null;
}
