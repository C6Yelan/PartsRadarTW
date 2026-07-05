// apps/crawler/src/scripts/ops/discord-bot/interactions/price-report-settings.ts
import { createPriceReportSettingsComponents, type parsePriceReportModalSubmit } from "../commands";
import {
  DISCORD_EMBED_COLOR,
  MAX_PRICE_REPORT_ITEMS,
  MAX_PRICE_REPORT_KEYWORD_GROUPS,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
} from "../constants";
import {
  formatPriceReportCategoryFilterLabel,
  formatPriceReportContentFilterLabel,
  formatPriceReportKeywordFilterLabel,
  formatTaipeiMinute,
  formatWindowLabel,
  type PriceReportCategoryOption,
  type PriceReportDeliveryStatus,
  readLatestScheduledPriceReportDelivery,
  readPriceReportCategories,
  readPriceReportSetting,
  toPriceReportFilters,
} from "../price-report";
import {
  formatDiscordBotText,
  formatDiscordDeliveryFailureForUser,
  formatDiscordRateLimitForUser,
} from "../rest";
import type {
  DiscordBotClient,
  DiscordBotEmbed,
  DiscordBotMessage,
  DiscordBotOptions,
  PriceReportNowResult,
  PriceReportTimeOfDay,
} from "../types";

interface PriceReportSettingsPanel {
  setting: Awaited<ReturnType<typeof readPriceReportSetting>>;
  categories: PriceReportCategoryOption[];
  latestDelivery: PriceReportDeliveryStatus | null;
  options: DiscordBotOptions;
  notice?: string;
}

export async function readPriceReportSettingsPanel({
  client,
  discordUserId,
  options,
  notice,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  options: DiscordBotOptions;
  notice?: string;
}): Promise<PriceReportSettingsPanel> {
  const [setting, categories, latestDelivery] = await Promise.all([
    readPriceReportSetting({ client, discordUserId }),
    readPriceReportCategories({ client }),
    readLatestScheduledPriceReportDelivery({ client, discordUserId }),
  ]);

  return {
    setting,
    categories,
    latestDelivery,
    options,
    notice,
  };
}

export function createPriceReportSettingsPanelMessage({
  setting,
  categories,
  latestDelivery,
  options,
  notice,
}: PriceReportSettingsPanel): DiscordBotMessage {
  const filters = toPriceReportFilters(setting);

  return {
    embeds: [
      createPriceReportSettingsEmbed({ setting, categories, latestDelivery, options, notice }),
    ],
    components: createPriceReportSettingsComponents({
      windowHours: resolveWindowHours(setting?.window),
      categories,
      categoryIgrps: filters.categoryIgrps,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
      enabled: setting?.enabled ?? false,
    }),
  };
}

export function formatPriceReportPreviewDmNotice(result: PriceReportNowResult): string {
  if (result.status === "sent") {
    return `已傳送預覽 DM：列出 ${result.listedCount} 筆，送出 ${result.messageCount} 則訊息。`;
  }

  if (result.status === "rate_limited") {
    return formatDiscordRateLimitForUser();
  }

  return formatDiscordDeliveryFailureForUser(result.message);
}

export function parsePriceReportCategorySelection(
  values: string[],
  categories: PriceReportCategoryOption[],
): number[] | null {
  const visibleCategories = categories.slice(0, 25);
  const visibleIgrps = new Set(visibleCategories.map((category) => category.igrp));
  const selectedIgrps = new Set<number>();

  for (const value of values) {
    if (!/^[1-9][0-9]*$/.test(value)) {
      return null;
    }

    const igrp = Number(value);

    if (!visibleIgrps.has(igrp)) {
      return null;
    }

    selectedIgrps.add(igrp);
  }

  if (selectedIgrps.size === 0 || selectedIgrps.size === visibleIgrps.size) {
    return [];
  }

  return [...selectedIgrps].sort((left, right) => left - right);
}

export function formatPriceReportModalValidationMessage(
  modal: NonNullable<ReturnType<typeof parsePriceReportModalSubmit>>,
): string {
  if (modal.name === "keyword") {
    return formatPriceReportKeywordValidationMessage();
  }

  const messages = [
    modal.maxItemsInputValid ? null : `最多商品數需為 1-${MAX_PRICE_REPORT_ITEMS} 的整數。`,
    modal.timeInputValid ? null : "每日發送時間格式需為台北時間 HH:mm，例如 `09:30` 或 `21:00`。",
  ].filter((message): message is string => message !== null);

  return messages.join("\n");
}

export function formatPriceReportKeywordValidationMessage(): string {
  return `商品關鍵字最多 ${MAX_PRICE_REPORT_KEYWORD_LENGTH} 個字，且最多 ${MAX_PRICE_REPORT_KEYWORD_GROUPS} 組。`;
}

export function resolveWindowHours(window: string | undefined): number {
  if (window === "HOURS_6") {
    return 6;
  }

  if (window === "HOURS_12") {
    return 12;
  }

  return 24;
}

export function resolveTimeOfDay(value: Date | null | undefined): PriceReportTimeOfDay {
  const [hourValue, minuteValue] = formatTaipeiTimeInput(value).split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  return Number.isInteger(hour) && Number.isInteger(minute)
    ? { hour, minute }
    : { hour: 9, minute: 0 };
}

export function formatTaipeiTimeInput(value: Date | null | undefined): string {
  if (!value) {
    return "09:00";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("hour")}:${byType.get("minute")}`;
}

function createPriceReportSettingsEmbed({
  setting,
  categories,
  latestDelivery,
  options,
  notice,
}: PriceReportSettingsPanel): DiscordBotEmbed {
  const enabled = setting?.enabled ?? false;
  const filters = toPriceReportFilters(setting);
  const description = [
    notice ? `**${notice}**` : null,
    enabled ? "每日價格提醒已開啟。" : "尚未開啟每日價格提醒。",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    title: "價格報告設定",
    description,
    color: DISCORD_EMBED_COLOR,
    fields: [
      {
        name: "統計區間",
        value: setting ? formatWindowLabel(setting.window) : "過去 24 小時",
        inline: true,
      },
      {
        name: "分類",
        value: formatPriceReportCategoryFilterLabel(filters, categories),
        inline: true,
      },
      {
        name: "內容",
        value: formatPriceReportContentFilterLabel(filters),
        inline: true,
      },
      {
        name: "商品關鍵字",
        value: formatPriceReportKeywordFilterLabel(filters),
        inline: true,
      },
      {
        name: "每次最多",
        value: `${setting?.maxItems ?? options.priceReportMaxItems} 筆`,
        inline: true,
      },
      {
        name: "每日時間",
        value: formatTaipeiTimeInput(setting?.nextSendAt),
        inline: true,
      },
      {
        name: "下一次",
        value: enabled && setting ? formatTaipeiMinute(setting.nextSendAt) : "啟用後排程",
        inline: true,
      },
      {
        name: "最近一次每日報告",
        value: formatPriceReportDeliveryStatus(latestDelivery),
      },
    ],
  };
}

function formatPriceReportDeliveryStatus(delivery: PriceReportDeliveryStatus | null): string {
  if (!delivery) {
    return "尚無每日報告紀錄。";
  }

  const deliveredAt = formatTaipeiMinute(delivery.deliveredAt ?? delivery.createdAt);

  if (delivery.status === "SENT") {
    return `成功：${deliveredAt}，列出 ${delivery.itemCount} 筆，送出 ${delivery.messageCount} 則訊息。`;
  }

  if (delivery.status === "RATE_LIMITED") {
    return `Discord 限流：${deliveredAt}。${formatDiscordRateLimitForUser()}`;
  }

  if (delivery.status === "FAILED") {
    return `失敗：${deliveredAt}。${formatPriceReportDeliveryError(delivery.errorMessage)}`;
  }

  return `${delivery.status}：${deliveredAt}，列出 ${delivery.itemCount} 筆。`;
}

export function formatPriceReportDeliveryError(errorMessage: string | null): string {
  return formatDiscordBotText(formatDiscordDeliveryFailureForUser(errorMessage), 220);
}
