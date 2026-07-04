// apps/crawler/src/scripts/ops/discord-bot/watch/message-formatting.ts
import {
  formatDiscordBotText,
  formatDiscordDeliveryFailureForUser,
  formatDiscordRateLimitForUser,
} from "../rest";
import type { TargetPriceWatchDeliveryStatus, TargetPriceWatchListRecord } from "./records";
import { WATCH_SELECT_VALUE_PREFIX } from "./reference";

const WATCH_SELECT_LABEL_MAX_LENGTH = 100;
const WATCH_SELECT_DESCRIPTION_MAX_LENGTH = 100;

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
  const currentCurrency = watch.product.currentPrice?.priceSnapshot.currency ?? watch.currency;
  const currentPriceLabel =
    currentPrice === null ? "目前價格未知" : formatTaiwanDollar(currentPrice, currentCurrency);
  const productName = toSingleLine(watch.product.name);

  return {
    label: formatDiscordBotText(productName, WATCH_SELECT_LABEL_MAX_LENGTH),
    value: `${WATCH_SELECT_VALUE_PREFIX}${watch.id}`,
    description: formatDiscordBotText(
      `${currentPriceLabel} / 目標 ${formatTaiwanDollar(watch.targetPrice, watch.currency)}`,
      WATCH_SELECT_DESCRIPTION_MAX_LENGTH,
    ),
    default: selected || undefined,
  };
}

export function formatWatchSummaryFields(
  watch: TargetPriceWatchListRecord,
  delivery: TargetPriceWatchDeliveryStatus | null = null,
): Array<{
  name: string;
  value: string;
  inline?: boolean;
}> {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price ?? null;
  const currentCurrency = watch.product.currentPrice?.priceSnapshot.currency ?? watch.currency;
  const priceSeenAt =
    watch.product.currentPrice?.lastSeenAt ??
    watch.product.currentPrice?.priceSnapshot.capturedAt ??
    null;

  const fields = [
    {
      name: "目前價格",
      value:
        currentPrice === null ? "目前價格未知" : formatTaiwanDollar(currentPrice, currentCurrency),
      inline: true,
    },
    {
      name: "價格資料時間",
      value: priceSeenAt ? formatTaipeiMinute(priceSeenAt) : "尚無價格資料",
      inline: true,
    },
    {
      name: "目標價格",
      value: formatTaiwanDollar(watch.targetPrice, watch.currency),
      inline: true,
    },
    {
      name: "追蹤狀態",
      value: formatWatchStatus({
        currentPrice,
        targetPrice: watch.targetPrice,
        currency: currentCurrency,
        lastNotifiedAt: watch.lastNotifiedAt,
      }),
    },
  ];
  const deliveryField = formatWatchNotificationDeliveryField(delivery);

  return deliveryField ? [...fields, deliveryField] : fields;
}

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
      value: `限流：${happenedAt}。\n${formatDiscordRateLimitForUser()}`,
    };
  }

  if (delivery.status === "FAILED") {
    return {
      name: "最近一次通知",
      value: `失敗：${happenedAt}。\n${formatDiscordDeliveryFailureForUser(delivery.errorMessage)}`,
    };
  }

  return null;
}

function formatWatchStatus({
  currentPrice,
  targetPrice,
  currency,
  lastNotifiedAt,
}: {
  currentPrice: number | null;
  targetPrice: number;
  currency: string;
  lastNotifiedAt: Date | null;
}): string {
  if (currentPrice === null) {
    return "等待商品價格資料更新。";
  }

  if (currentPrice <= targetPrice) {
    return lastNotifiedAt
      ? "已達到目標價格，且已發送通知。"
      : "已達到目標價格；目前價格低於或等於目標價。";
  }

  return `尚未達標；目前價格仍高於目標價 ${formatTaiwanDollar(currentPrice - targetPrice, currency)}。`;
}

export function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

export function formatTaipeiMinute(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("month")}/${byType.get("day")} ${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}

export function formatTaiwanDollar(amount: number, currency: string): string {
  if (currency === "TWD") {
    return `NT$${amount.toLocaleString("en-US")}`;
  }

  return `${currency} ${amount.toLocaleString("en-US")}`;
}

export function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[[\]\\]/g, "\\$&");
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
