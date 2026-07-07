// apps/crawler/src/scripts/ops/discord-bot/watch/manager-message.ts
// 組裝目標價 watch 管理面板的 Discord embed、select menu、操作按鈕與分頁控制。

import {
  WATCH_ADD_CUSTOM_ID,
  WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_EDIT_CUSTOM_ID_PREFIX,
  WATCH_FILTER_CUSTOM_ID_PREFIX,
  WATCH_PAGE_CUSTOM_ID_PREFIX,
  WATCH_REFRESH_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_SELECT_CUSTOM_ID_PREFIX,
  WATCH_SORT_CUSTOM_ID_PREFIX,
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
import { formatDiscordBotText } from "../rest";
import type { DiscordBotMessage, DiscordButtonComponent } from "../types";
import type {
  TargetPriceWatchDeliveryStatus,
  TargetPriceWatchlistResult,
} from "./records";
import {
  formatWatchListDisplayState,
  formatWatchListState,
} from "./list-state";
import { WATCH_MANAGER_PAGE_SIZE } from "./list-limits";
import {
  createProductUrl,
  escapeMarkdownLinkText,
  formatWatchSelectOption,
  formatWatchSummaryFields,
} from "./message-formatting";
import { normalizeWatchId } from "./reference";

const WATCH_MANAGER_GUIDE =
  "追蹤商品目標價，並與目前價格比較。\n\n" +
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
  const state = formatWatchListState(result);
  const managerState = selectedWatch
    ? `**目前選取的商品**\n[${escapeMarkdownLinkText(
        formatDiscordBotText(selectedWatch.product.name, PRODUCT_NAME_MAX_LENGTH),
      )}](${createProductUrl(publicBaseUrl, selectedWatch.product.id)})\n\n可編輯目標價或移除追蹤。`
    : result.filteredCount > 0
      ? "**你的追蹤清單**\n從選單選商品查看或管理。"
      : result.totalCount > 0
        ? "**你的追蹤清單**\n目前篩選沒有符合商品，可調整篩選條件。"
        : "**你的追蹤清單**\n尚未追蹤商品，請按「新增追蹤」。";
  const description = [
    notice ? `**${notice}**` : null,
    WATCH_MANAGER_GUIDE,
    result.totalCount > 0 ? formatWatchListDisplayState(result) : null,
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
          custom_id: `${WATCH_SELECT_CUSTOM_ID_PREFIX}${state}`,
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

  if (result.totalCount > 0) {
    components.push(createStatusFilterRow(result, state));
    components.push(createSortRow(result, state));
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
        ? `${WATCH_EDIT_CUSTOM_ID_PREFIX}${selectedWatch.id}:${selectedWatch.targetPrice}:${state}`
        : `${WATCH_EDIT_CUSTOM_ID_PREFIX}none:0:${state}`,
      label: "編輯目標價",
      disabled: selectedWatch === null,
    },
    {
      type: DISCORD_COMPONENT_TYPE_BUTTON,
      style: DISCORD_BUTTON_STYLE_DANGER,
      custom_id: selectedWatch
        ? `${WATCH_REMOVE_CUSTOM_ID_PREFIX}${selectedWatch.id}:${state}`
        : `${WATCH_REMOVE_CUSTOM_ID_PREFIX}none:${state}`,
      label: "移除追蹤",
      disabled: selectedWatch === null,
    },
  ];

  if (result.watches.length > 0) {
    actionButtons.push({
      type: DISCORD_COMPONENT_TYPE_BUTTON,
      style: DISCORD_BUTTON_STYLE_DANGER,
      custom_id: `${WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX}${state}`,
      label: "批次移除",
    });
  }

  actionButtons.push({
    type: DISCORD_COMPONENT_TYPE_BUTTON,
    style: DISCORD_BUTTON_STYLE_SECONDARY,
    custom_id: `${WATCH_REFRESH_CUSTOM_ID_PREFIX}${state}`,
    label: "重新整理",
  });

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
          custom_id: `${WATCH_PAGE_CUSTOM_ID_PREFIX}${formatWatchListState({
            page: Math.max(0, result.page - 1),
            statusFilter: result.statusFilter,
            sortKey: result.sortKey,
          })}`,
          label: "上一頁",
          disabled: !result.hasPreviousPage,
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: `${WATCH_PAGE_CUSTOM_ID_PREFIX}${formatWatchListState({
            page: result.page + 1,
            statusFilter: result.statusFilter,
            sortKey: result.sortKey,
          })}`,
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

// 建立 watch 狀態篩選選單，讓目前管理面板可切換全部、已達標與未達標。
function createStatusFilterRow(
  result: TargetPriceWatchlistResult,
  state: string,
): NonNullable<DiscordBotMessage["components"]>[number] {
  return {
    type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
        custom_id: `${WATCH_FILTER_CUSTOM_ID_PREFIX}${state}`,
        placeholder: "篩選追蹤狀態",
        min_values: 1,
        max_values: 1,
        options: [
          {
            label: "全部",
            value: "all",
            description: "顯示所有目標價追蹤",
            default: result.statusFilter === "all" || undefined,
          },
          {
            label: "已達標",
            value: "reached",
            description: "目前價格低於或等於目標價",
            default: result.statusFilter === "reached" || undefined,
          },
          {
            label: "未達標",
            value: "unreached",
            description: "尚未達標或目前價格未知",
            default: result.statusFilter === "unreached" || undefined,
          },
        ],
      },
    ],
  };
}

// 建立 watch 排序選單，讓目前管理面板可切換最近更新、目標價與目前價格排序。
function createSortRow(
  result: TargetPriceWatchlistResult,
  state: string,
): NonNullable<DiscordBotMessage["components"]>[number] {
  return {
    type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
        custom_id: `${WATCH_SORT_CUSTOM_ID_PREFIX}${state}`,
        placeholder: "調整排序",
        min_values: 1,
        max_values: 1,
        options: [
          {
            label: "最近更新",
            value: "recent",
            description: "最近修改的追蹤排在前面",
            default: result.sortKey === "recent" || undefined,
          },
          {
            label: "目標價低到高",
            value: "target",
            description: "依設定的目標價格排序",
            default: result.sortKey === "target" || undefined,
          },
          {
            label: "目前價格低到高",
            value: "current",
            description: "目前價格未知會排在最後",
            default: result.sortKey === "current" || undefined,
          },
        ],
      },
    ],
  };
}
