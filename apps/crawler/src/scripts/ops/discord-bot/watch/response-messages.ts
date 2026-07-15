// apps/crawler/src/scripts/ops/discord-bot/watch/response-messages.ts
// 組裝目標價 watch 新增結果與單筆移除確認的 Discord 回覆訊息。

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
import {
  createProductUrl,
  escapeMarkdownLinkText,
  formatDiscordBotText,
  formatTaipeiMinute,
  formatTaiwanDollar,
  toSingleLine,
} from "../message-text";
import type { DiscordBotMessage } from "../types";
import { formatWatchSummaryFields } from "./message-formatting";
import type { CreateTargetPriceWatchResult, TargetPriceWatchLookupResult } from "./records";

// 將建立 watch 的 domain result 轉成使用者可讀回覆，成功時附上商品、目前價格與目標價。
export function createTargetPriceWatchResponseMessage({
  result,
  publicBaseUrl,
}: {
  result: CreateTargetPriceWatchResult;
  publicBaseUrl: string;
}): DiscordBotMessage {
  if (result.status === "invalid_product_reference") {
    return {
      content: "無法辨識商品。請貼上商品頁網址或網址最後那串ID。",
    };
  }

  if (result.status === "invalid_target_price") {
    return {
      content: `目標價格請輸入 1-${MAX_TARGET_PRICE.toLocaleString("en-US")} 範圍內純數字，不要加NT$、逗號或空格。`,
    };
  }

  if (result.status === "product_not_found") {
    return {
      content: "找不到可追蹤的商品。請確認商品頁網址或商品 ID 正確，且該商品目前仍有價格資料。",
    };
  }

  if (result.status === "watch_limit_reached") {
    return {
      content: `已追蹤${result.maxWatches}個商品，已達上限。請先在 /watch 移除不需要的追蹤，再新增商品。`,
    };
  }

  const productName = formatDiscordBotText(
    toSingleLine(result.product.name),
    PRODUCT_NAME_MAX_LENGTH,
  );
  const targetDelta = result.currentPrice - result.watch.targetPrice;
  const status = result.reached
    ? "已達到你設定的目標價，bot 會嘗試傳送私訊提醒。"
    : `尚未達標，目前價格比目標價高 ${formatTaiwanDollar(targetDelta)}。`;

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
            value: formatTaiwanDollar(result.currentPrice),
            inline: true,
          },
          {
            name: "目標價格",
            value: formatTaiwanDollar(result.watch.targetPrice),
            inline: true,
          },
          {
            name: "提醒狀態",
            value: status,
          },
        ],
        footer: {
          text: `價格更新時間：${formatTaipeiMinute(result.capturedAt)}`,
        },
      },
    ],
  };
}

// 建立單筆移除確認訊息，保留目前頁碼讓取消或確認後能回到原管理面板。
export function createTargetPriceWatchRemovalConfirmationMessage({
  result,
  publicBaseUrl,
  page,
}: {
  result: TargetPriceWatchLookupResult;
  publicBaseUrl: string;
  page: number;
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

  const productName = formatDiscordBotText(
    toSingleLine(result.watch.product.name),
    PRODUCT_NAME_MAX_LENGTH,
  );

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
            custom_id: `${WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX}${result.watch.id}:${page}`,
            label: "確認移除",
          },
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_SECONDARY,
            custom_id: `${WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX}${result.watch.id}:${page}`,
            label: "返回設定",
          },
        ],
      },
    ],
  };
}
