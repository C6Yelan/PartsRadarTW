// apps/crawler/src/scripts/ops/discord-bot/watch/manager-message.ts
// 組裝目標價 watch 管理面板的 Discord embed、select menu、操作按鈕與分頁控制。

import {
  WATCH_ADD_CUSTOM_ID,
  WATCH_EDIT_CUSTOM_ID_PREFIX,
  WATCH_PAGE_CUSTOM_ID_PREFIX,
  WATCH_REFRESH_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_SELECT_CUSTOM_ID_PREFIX,
} from "../commands";
import {
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_COMPONENT_TYPE_STRING_SELECT,
  DISCORD_EMBED_COLOR,
  MAX_TARGET_PRICE_WATCHES_PER_USER,
  PRODUCT_NAME_MAX_LENGTH,
} from "../constants";
import {
  createProductUrl,
  escapeMarkdownLinkText,
  formatDiscordBotText,
  toSingleLine,
} from "../message-text";
import type { DiscordBotMessage, DiscordButtonComponent } from "../types";
import { WATCH_MANAGER_PAGE_SIZE } from "./list-limits";
import { formatWatchSelectOption, formatWatchSummaryFields } from "./message-formatting";
import type { TargetPriceWatchDeliveryStatus, TargetPriceWatchlistResult } from "./records";
import { normalizeWatchId } from "./reference";

const WATCH_MANAGER_GUIDE =
  "追蹤商品目標價；價格達標時會嘗試透過 DM 傳送目標價提醒。\n\n" +
  "**使用方式**\n" +
  "新增：貼商品頁網址與目標價。\n" +
  `管理：從選單選商品後編輯或移除，每人最多 ${MAX_TARGET_PRICE_WATCHES_PER_USER} 項。`;

// 建立 /watch 管理面板訊息，依目前清單狀態呈現選取商品、管理操作與分頁控制。
export function createTargetPriceWatchManagerMessage({
  result,
  publicBaseUrl,
  selectedWatchInput = null,
  selectedWatchDelivery = null,
  notice,
}: {
  result: TargetPriceWatchlistResult;
  publicBaseUrl: string;
  selectedWatchInput?: string | null;
  selectedWatchDelivery?: TargetPriceWatchDeliveryStatus | null;
  notice?: string;
}): DiscordBotMessage {
  const selectedWatchId = normalizeWatchId(selectedWatchInput);
  const selectedWatch = result.watches.find((watch) => watch.id === selectedWatchId) ?? null;
  const managerState = selectedWatch
    ? `**目前選取的商品**\n[${escapeMarkdownLinkText(
        formatDiscordBotText(toSingleLine(selectedWatch.product.name), PRODUCT_NAME_MAX_LENGTH),
      )}](${createProductUrl(publicBaseUrl, selectedWatch.product.id)})\n\n可編輯目標價或移除追蹤。`
    : result.totalCount > 0
      ? "**你的追蹤清單**\n從選單選商品查看或管理。"
      : "**你的追蹤清單**\n尚未追蹤商品，請按「新增追蹤」。";
  const description = [
    notice ? `**${notice}**` : null,
    WATCH_MANAGER_GUIDE,
    result.totalCount > 0 ? `共 ${result.totalCount} 項，最近更新優先。` : null,
    managerState,
  ]
    .filter((section): section is string => section !== null)
    .join("\n\n");
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

  const actionButtons: DiscordButtonComponent[] = [
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
  ];

  components.push({
    type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
    components: actionButtons,
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
        title: "商品目標價追蹤",
        description,
        color: DISCORD_EMBED_COLOR,
        fields: selectedWatch
          ? formatWatchSummaryFields(selectedWatch, selectedWatchDelivery)
          : undefined,
        footer: {
          text: `第 ${result.page + 1} 頁，每頁最多 ${WATCH_MANAGER_PAGE_SIZE} 筆`,
        },
      },
    ],
    components,
  };
}
