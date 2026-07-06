// apps/crawler/src/scripts/ops/discord-bot/interactions/watch-manager.ts
// 提供 target-price watch 管理面板共用 helper，串接列表讀取、delivery 狀態與 modal 驗證訊息。

import type { parseTargetPriceWatchModalSubmit } from "../commands";
import { MAX_TARGET_PRICE } from "../constants";
import type { DiscordBotClient, DiscordBotMessage } from "../types";
import {
  createTargetPriceWatchManagerMessage,
  readLatestTargetPriceWatchDelivery,
  readTargetPriceWatchlist,
} from "../watch";

// 將 watch modal parser 的驗證結果轉成使用者可讀錯誤訊息。
export function formatTargetPriceWatchModalValidationMessage(
  modal: NonNullable<ReturnType<typeof parseTargetPriceWatchModalSubmit>>,
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

// 讀取 watch 管理面板頁面；刪除後若目前頁變空，會自動退回前一頁。
export async function readTargetPriceWatchManagerPage({
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
    return readTargetPriceWatchManagerPage({
      client,
      discordUserId,
      page: page - 1,
      statusFilter: result.statusFilter,
      sortKey: result.sortKey,
    });
  }

  return result;
}

// 建立 watch 管理面板訊息，並在選取商品時附上最近一次目標價通知狀態。
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
  result: Awaited<ReturnType<typeof readTargetPriceWatchManagerPage>>;
  publicBaseUrl: string;
  selectedWatchInput?: string | null;
  notice?: string;
}): Promise<DiscordBotMessage> {
  const selectedWatchId = extractTargetPriceWatchId(selectedWatchInput);
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

// 從 watch component / modal 傳遞的 reference 中解析內部 watch id。
export function extractTargetPriceWatchId(targetPriceWatchInput: string | null): string | null {
  const match = /^watch:([0-9a-f-]{36})$/i.exec(targetPriceWatchInput ?? "");

  return match?.[1] ?? null;
}
