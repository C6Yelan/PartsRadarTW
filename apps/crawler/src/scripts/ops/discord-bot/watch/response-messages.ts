// apps/crawler/src/scripts/ops/discord-bot/watch/response-messages.ts
import {
  WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
} from "../commands";
import {
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_EMBED_COLOR,
  MAX_TARGET_PRICE,
  PRODUCT_NAME_MAX_LENGTH,
} from "../constants";
import { formatDiscordBotText } from "../rest";
import type { DiscordBotMessage, TargetPriceWatchSortKey, TargetPriceWatchStatusFilter } from "../types";
import { formatWatchListState } from "./list-state";
import {
  createProductUrl,
  escapeMarkdownLinkText,
  formatTaipeiMinute,
  formatTaiwanDollar,
  formatWatchSummaryFields,
} from "./message-formatting";
import type { CreateTargetPriceWatchResult, TargetPriceWatchLookupResult } from "./records";

export function createTargetPriceWatchResponseMessage({
  result,
  publicBaseUrl,
}: {
  result: CreateTargetPriceWatchResult;
  publicBaseUrl: string;
}): DiscordBotMessage {
  if (result.status === "invalid_product_reference") {
    return {
      content:
        "無法辨識商品。請貼上 PartsRadarTW 商品頁完整網址，或輸入網址 `/products/` 後面的商品 ID。",
    };
  }

  if (result.status === "invalid_target_price") {
    return {
      content: `目標價格需為 1-${MAX_TARGET_PRICE.toLocaleString("en-US")} 的新台幣整數，請不要輸入 NT$、逗號或空格。`,
    };
  }

  if (result.status === "product_not_found") {
    return {
      content: "找不到可追蹤的商品。請確認商品頁網址或商品 ID 正確，且該商品目前仍有價格資料。",
    };
  }

  if (result.status === "watch_limit_reached") {
    return {
      content: `你已達到最多 ${result.maxWatches} 個商品追蹤。請先在 /watch 移除不需要的追蹤，再新增商品。`,
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
        title: "已儲存商品目標價",
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
            name: "追蹤狀態",
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

export function createTargetPriceWatchRemovalConfirmationMessage({
  result,
  publicBaseUrl,
  page,
  statusFilter = "all",
  sortKey = "recent",
}: {
  result: TargetPriceWatchLookupResult;
  publicBaseUrl: string;
  page: number;
  statusFilter?: TargetPriceWatchStatusFilter;
  sortKey?: TargetPriceWatchSortKey;
}): DiscordBotMessage {
  if (result.status === "invalid_reference") {
    return {
      content: "無法辨識要移除的商品，請重新執行 `/watch` 並從清單選擇。",
    };
  }

  if (result.status === "not_found") {
    return {
      content: "這項追蹤可能已被移除，請重新執行 `/watch` 取得最新清單。",
    };
  }

  const productName = formatDiscordBotText(result.watch.product.name, PRODUCT_NAME_MAX_LENGTH);
  const state = formatWatchListState({ page, statusFilter, sortKey });

  return {
    embeds: [
      {
        title: "確認移除目標價追蹤",
        description: `你即將移除以下商品的目標價追蹤：\n\n[${escapeMarkdownLinkText(productName)}](${createProductUrl(
          publicBaseUrl,
          result.watch.product.id,
        )})\n\n移除後，這項商品將不再出現在你的追蹤清單。`,
        color: DISCORD_EMBED_COLOR,
        fields: formatWatchSummaryFields(result.watch),
        footer: {
          text: "商品資料不會被刪除；按下「確認移除」後才會生效。",
        },
      },
    ],
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
        components: [
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_DANGER,
            custom_id: `${WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX}${result.watch.id}:${state}`,
            label: "確認移除",
          },
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_SECONDARY,
            custom_id: `${WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX}${result.watch.id}:${state}`,
            label: "返回設定",
          },
        ],
      },
    ],
  };
}
