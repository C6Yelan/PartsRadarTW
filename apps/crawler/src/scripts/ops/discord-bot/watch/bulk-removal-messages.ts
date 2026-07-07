// apps/crawler/src/scripts/ops/discord-bot/watch/bulk-removal-messages.ts
// 組裝目標價 watch 批次移除流程的選取頁與確認頁 Discord 訊息。
// 僅供待移除的批次移除流程使用；新增功能不要再依賴此檔案。

import {
  WATCH_BULK_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_SELECT_CUSTOM_ID_PREFIX,
  WATCH_REFRESH_CUSTOM_ID_PREFIX,
} from "../commands";
import {
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_COMPONENT_TYPE_STRING_SELECT,
  DISCORD_EMBED_COLOR,
  PRODUCT_NAME_MAX_LENGTH,
} from "../constants";
import { formatDiscordBotText } from "../rest";
import type { DiscordBotMessage } from "../types";
import { formatWatchListState } from "./list-state";
import { WATCH_MANAGER_PAGE_SIZE } from "./list-limits";
import {
  createProductUrl,
  escapeMarkdownLinkText,
  formatWatchSelectOption,
} from "./message-formatting";
import type { TargetPriceWatchlistResult } from "./records";
import { normalizeWatchId } from "./reference";

// 建立批次移除的多選頁，讓使用者先選出要移除的 watch。
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

// 建立批次移除確認頁，只有在確認 token 仍有效時才會由 handler 執行實際停用。
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
      .map((targetPriceWatchInput) => normalizeWatchId(targetPriceWatchInput))
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
