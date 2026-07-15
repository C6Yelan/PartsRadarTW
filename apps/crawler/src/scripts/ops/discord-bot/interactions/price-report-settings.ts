// apps/crawler/src/scripts/ops/discord-bot/interactions/price-report-settings.ts
// 組裝個人 price-report 設定面板，並提供表單驗證訊息、時間格式與分類選擇 helper。

import { createPriceReportSettingsComponents, type parsePriceReportModalSubmit } from "../commands";
import {
  DISCORD_EMBED_COLOR,
  MAX_PRICE_REPORT_KEYWORD_GROUPS,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
  TIME_ZONE,
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
import { toWindowHours } from "../price-report/schedule";
import {
  formatDiscordDeliveryFailureFieldValue,
  formatDiscordDeliveryFailureForUser,
  formatDiscordRateLimitForUser,
} from "../rest";
import type {
  DiscordBotClient,
  DiscordBotEmbed,
  DiscordBotMessage,
  PersonalPriceReportDeliveryResult,
  PriceReportTimeOfDay,
} from "../types";

// 個人 price-report 設定面板所需資料，由 slash command、component handler 與 modal submit 共用。
interface PriceReportSettingsPanel {
  setting: Awaited<ReturnType<typeof readPriceReportSetting>>;
  categories: PriceReportCategoryOption[];
  latestDelivery: PriceReportDeliveryStatus | null;
  notice?: string;
}

// 讀取個人 price-report 設定面板資料，包含目前設定、可選分類與最近一次每日私訊價格報告狀態。
export async function readPriceReportSettingsPanel({
  client,
  discordUserId,
  notice,
}: {
  client: DiscordBotClient;
  discordUserId: string;
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
    notice,
  };
}

// 建立個人 price-report 設定面板訊息，將設定摘要與互動元件保持同一份 filters 狀態。
export function createPriceReportSettingsPanelMessage({
  setting,
  categories,
  latestDelivery,
  notice,
}: PriceReportSettingsPanel): DiscordBotMessage {
  const filters = toPriceReportFilters(setting);

  return {
    embeds: [createPriceReportSettingsEmbed({ setting, categories, latestDelivery, notice })],
    components: createPriceReportSettingsComponents({
      windowHours: toWindowHours(setting?.window),
      categories,
      categoryIgrps: filters.categoryIgrps,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
      enabled: setting?.enabled ?? false,
    }),
  };
}

// 將立即預覽 DM 的發送結果轉成設定面板 notice，避免暴露 Discord 原始錯誤細節。
export function formatPriceReportPreviewDmNotice(
  result: PersonalPriceReportDeliveryResult,
): string {
  if (result.status === "sent") {
    return `已傳送預覽 DM：列出 ${result.listedCount} 筆，送出 ${result.messageCount} 則訊息。`;
  }

  if (result.status === "rate_limited") {
    return formatDiscordRateLimitForUser();
  }

  return formatDiscordDeliveryFailureForUser(result);
}

// 建立個人 price-report modal 驗證錯誤訊息，讓 submit handler 共用同一組使用者回覆。
export function formatPriceReportModalValidationMessage(
  modal: NonNullable<ReturnType<typeof parsePriceReportModalSubmit>>,
): string {
  if (modal.name === "keyword") {
    return formatPriceReportKeywordValidationMessage();
  }

  return modal.timeInputValid
    ? ""
    : "每日發送時間格式需為台北時間 HH:mm，例如 `09:30` 或 `21:00`。";
}

// 建立商品關鍵字輸入錯誤訊息，對齊 modal 說明中的長度與分組限制。
export function formatPriceReportKeywordValidationMessage(): string {
  return `商品名稱關鍵字合計最多 ${MAX_PRICE_REPORT_KEYWORD_LENGTH} 個字、最多 ${MAX_PRICE_REPORT_KEYWORD_GROUPS} 組；同一欄的詞需全部符合，不同欄符合其中一組即可。`;
}

// 將既有 nextSendAt 轉為 modal 可用的台北時間；無法解析時回到 09:00。
export function resolveTimeOfDay(value: Date | null | undefined): PriceReportTimeOfDay {
  const [hourValue, minuteValue] = formatTaipeiTimeInput(value).split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  return Number.isInteger(hour) && Number.isInteger(minute)
    ? { hour, minute }
    : { hour: 9, minute: 0 };
}

// 將 Date 格式化成台北時間 HH:mm，作為 modal 預填值與設定面板顯示。
export function formatTaipeiTimeInput(value: Date | null | undefined): string {
  if (!value) {
    return "09:00";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("hour")}:${byType.get("minute")}`;
}

// 建立個人 price-report 設定 embed，呈現目前篩選、排程時間與最近一次發送狀態。
function createPriceReportSettingsEmbed({
  setting,
  categories,
  latestDelivery,
  notice,
}: PriceReportSettingsPanel): DiscordBotEmbed {
  const enabled = setting?.enabled ?? false;
  const filters = toPriceReportFilters(setting);
  const description = [
    notice ? `**${notice}**` : null,
    enabled ? "每日私訊價格報告已開啟。" : "尚未開啟每日私訊價格報告。",
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
        name: "最近一次每日私訊價格報告",
        value: formatPriceReportDeliveryStatus(latestDelivery),
      },
    ],
  };
}

// 將最近一次每日私訊報告 delivery 狀態轉成設定面板欄位文字。
function formatPriceReportDeliveryStatus(delivery: PriceReportDeliveryStatus | null): string {
  if (!delivery) {
    return "尚無每日私訊價格報告紀錄。";
  }

  const deliveredAt = formatTaipeiMinute(delivery.deliveredAt ?? delivery.createdAt);

  if (delivery.status === "SENT") {
    return `成功：${deliveredAt}，列出 ${delivery.itemCount} 筆，送出 ${delivery.messageCount} 則訊息。`;
  }

  if (delivery.status === "RATE_LIMITED") {
    return `Discord 限流：${deliveredAt}。${formatDiscordRateLimitForUser()}`;
  }

  if (delivery.status === "FAILED") {
    return `失敗：${deliveredAt}。${formatDiscordDeliveryFailureFieldValue(delivery)}`;
  }

  return `${delivery.status}：${deliveredAt}，列出 ${delivery.itemCount} 筆。`;
}
