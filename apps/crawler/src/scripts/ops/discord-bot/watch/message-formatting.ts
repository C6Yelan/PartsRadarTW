// apps/crawler/src/scripts/ops/discord-bot/watch/message-formatting.ts
// 組裝目標價 watch 訊息中的商品選項、摘要欄位與通知狀態。

import {
  formatDiscordBotText,
  formatTaipeiMinute,
  formatTaiwanDollar,
  toSingleLine,
} from "../message-text";
import { formatDiscordDirectMessageFailureForUser } from "../rest";
import type { TargetPriceWatchDeliveryStatus, TargetPriceWatchListRecord } from "./records";
import { WATCH_SELECT_VALUE_PREFIX } from "./reference";

const WATCH_SELECT_LABEL_MAX_LENGTH = 100;
const WATCH_SELECT_DESCRIPTION_MAX_LENGTH = 100;

// 建立 watch 管理選單的單筆商品 option，符合 Discord select menu 的長度限制。
export function formatWatchSelectOption(
  watch: TargetPriceWatchListRecord,
  selected: boolean,
): {
  label: string;
  value: string;
  description: string;
  default?: boolean;
} {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price ?? null;
  const currentPriceLabel =
    currentPrice === null ? "目前價格未知" : `目前 ${formatTaiwanDollar(currentPrice)}`;
  const productName = toSingleLine(watch.product.name);

  return {
    label: formatDiscordBotText(productName, WATCH_SELECT_LABEL_MAX_LENGTH),
    value: `${WATCH_SELECT_VALUE_PREFIX}${watch.id}`,
    description: formatDiscordBotText(
      `${currentPriceLabel}，目標 ${formatTaiwanDollar(watch.targetPrice)}`,
      WATCH_SELECT_DESCRIPTION_MAX_LENGTH,
    ),
    default: selected || undefined,
  };
}

// 建立 watch 詳細摘要欄位，供管理面板、移除確認與回應訊息共用。
export function formatWatchSummaryFields(
  watch: TargetPriceWatchListRecord,
  delivery: TargetPriceWatchDeliveryStatus | null = null,
): Array<{
  name: string;
  value: string;
  inline?: boolean;
}> {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price ?? null;
  const priceSeenAt =
    watch.product.currentPrice?.lastSeenAt ??
    watch.product.currentPrice?.priceSnapshot.capturedAt ??
    null;

  const fields = [
    {
      name: "目前價格",
      value: currentPrice === null ? "目前價格未知" : formatTaiwanDollar(currentPrice),
      inline: true,
    },
    {
      name: "目標價格",
      value: formatTaiwanDollar(watch.targetPrice),
      inline: true,
    },
    {
      name: "價格更新時間",
      value: priceSeenAt ? formatTaipeiMinute(priceSeenAt) : "尚無價格資料",
      inline: true,
    },
    {
      name: "提醒狀態",
      value: formatWatchStatus({
        currentPrice,
        targetPrice: watch.targetPrice,
      }),
    },
  ];
  const deliveryField = formatWatchNotificationDeliveryField(delivery);

  return deliveryField ? [...fields, deliveryField] : fields;
}

// 將最近一次通知 delivery 狀態轉成使用者可見欄位，錯誤內容一律經過泛化格式化。
function formatWatchNotificationDeliveryField(
  delivery: TargetPriceWatchDeliveryStatus | null,
): { name: string; value: string } | null {
  if (!delivery || delivery.status === "SENT") {
    return null;
  }

  const happenedAt = formatTaipeiMinute(delivery.deliveredAt ?? delivery.createdAt);

  if (delivery.status === "RATE_LIMITED") {
    return {
      name: "最近一次通知",
      value: `${happenedAt}\nDiscord 暫時無法傳送提醒，bot 會稍後再試。`,
    };
  }

  if (delivery.status === "FAILED") {
    return {
      name: "最近一次通知",
      value: `失敗：${happenedAt}。\n${formatDiscordDirectMessageFailureForUser(delivery)}`,
    };
  }

  return null;
}

function formatWatchStatus({
  currentPrice,
  targetPrice,
}: {
  currentPrice: number | null;
  targetPrice: number;
}): string {
  if (currentPrice === null) {
    return "正在等待最新價格。";
  }

  if (currentPrice <= targetPrice) {
    return "已達到你設定的目標價，bot 會嘗試傳送私訊提醒。";
  }

  return `尚未達標，目前價格比目標價高 ${formatTaiwanDollar(currentPrice - targetPrice)}。`;
}
