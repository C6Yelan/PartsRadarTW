// apps/crawler/src/scripts/ops/discord-bot/interactions/public-report-settings/messages.ts
// 組裝 public-report 設定面板、狀態訊息、權限提醒與測試發送結果文字。

import { createPublicReportSettingsComponents } from "../../commands";
import {
  DISCORD_EMBED_COLOR,
  DISCORD_PERMISSION_EMBED_LINKS,
  DISCORD_PERMISSION_SEND_MESSAGES,
} from "../../constants";
import {
  formatPriceReportCategoryFilterLabel,
  formatPriceReportContentFilterLabel,
  formatPriceReportKeywordFilterLabel,
  formatTaipeiMinute,
  type PriceReportCategoryOption,
} from "../../price-report";
import {
  type PublicPriceReportDeliveryStatus,
  type PublicPriceReportPreviewResult,
  type PublicPriceReportSetting,
  toPublicPriceReportFilters,
} from "../../public-price-report";
import { formatDiscordDeliveryFailureForUser, formatDiscordRateLimitForUser } from "../../rest";
import type {
  DiscordBotEmbed,
  DiscordBotMessage,
  DiscordBotOptions,
  DiscordInteraction,
} from "../../types";
import { formatPriceReportDeliveryError } from "../price-report-settings";

// public-report 設定面板訊息所需的資料契約，由設定讀取流程與 interaction handler 共用。
export interface PublicPriceReportSettingsPanel {
  setting: PublicPriceReportSetting | null;
  latestDelivery: PublicPriceReportDeliveryStatus | null;
  categories: PriceReportCategoryOption[];
  options: DiscordBotOptions;
  currentChannelId: string;
  notice?: string;
}

// 建立可互動的 public-report 設定面板，包含目前設定摘要與設定用 component。
export function createPublicPriceReportSettingsPanelMessage({
  setting,
  latestDelivery,
  categories,
  options,
  currentChannelId,
  notice,
}: PublicPriceReportSettingsPanel): DiscordBotMessage {
  const filters = toPublicPriceReportFilters(setting);

  return {
    embeds: [
      createPublicPriceReportSettingsEmbed({
        setting,
        latestDelivery,
        categories,
        options,
        currentChannelId,
        notice,
      }),
    ],
    components: createPublicReportSettingsComponents({
      hasChannel: setting !== null,
      enabled: setting?.enabled ?? false,
      categories,
      categoryIgrps: filters.categoryIgrps,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
    }),
  };
}

// 建立只讀的 public-report 狀態訊息，用於 slash command 查詢目前設定與最近發送結果。
export function createPublicPriceReportStatusMessage(
  panel: PublicPriceReportSettingsPanel,
): DiscordBotMessage {
  return {
    embeds: [
      createPublicPriceReportSettingsEmbed({
        ...panel,
        title: "公開價格報告狀態",
        description: "目前即時公開價格報告的設定與最近一次發送紀錄。",
      }),
    ],
  };
}

// 依 Discord interaction 帶回的 app_permissions 判斷 bot 是否缺少公開報告發送所需權限。
export function formatPublicReportBotPermissionNotice(
  interaction: DiscordInteraction,
  channelId: string,
): string | null {
  const appPermissions = interaction.app_permissions?.trim();

  if (!appPermissions) {
    return null;
  }

  const missing = [
    hasDiscordPermission(appPermissions, DISCORD_PERMISSION_SEND_MESSAGES) ? null : "傳送訊息",
    hasDiscordPermission(appPermissions, DISCORD_PERMISSION_EMBED_LINKS) ? null : "嵌入連結",
  ].filter((permission): permission is string => permission !== null);

  if (missing.length === 0) {
    return null;
  }

  return `我目前無法在 <#${channelId}> 發送公開價格報告。請確認 PartsRadarTW bot 在該頻道具備「${missing.join("」與「")}」權限。`;
}

// 將測試公開報告的發送結果轉成使用者可讀訊息，並附上當次套用的篩選設定摘要。
export function formatPublicReportPreviewNotice(
  result: PublicPriceReportPreviewResult,
  channelId: string,
  setting: PublicPriceReportSetting,
  categories: PriceReportCategoryOption[],
): string {
  const settingSummary = formatPublicReportSettingSummary(setting, categories);

  if (result.status === "sent") {
    return `已發送測試公開報告到 <#${channelId}>：價格變動 ${result.changeCount}，新增商品 ${result.newProductCount}，列出 ${result.listedCount} 筆，送出 ${result.messageCount} 則訊息。\n${settingSummary}`;
  }

  if (result.status === "skipped") {
    return `過去 24 小時沒有符合設定的公開報告內容，未發送測試報告。\n${settingSummary}`;
  }

  if (result.status === "rate_limited") {
    return formatDiscordRateLimitForUser();
  }

  if (isDiscordMissingPermissionsError(result.message)) {
    return `我目前無法在 <#${channelId}> 發送公開價格報告。請確認 PartsRadarTW bot 在該頻道具備「傳送訊息」與「嵌入連結」權限。`;
  }

  return formatDiscordDeliveryFailureForUser(result.message);
}

// 建立 public-report 設定 embed；互動面板與只讀狀態訊息共用相同欄位排列。
function createPublicPriceReportSettingsEmbed({
  setting,
  latestDelivery,
  categories,
  options,
  currentChannelId,
  notice,
  title = "公開價格報告設定",
  description:
    baseDescription = "即時公開價格報告會在排程爬蟲完成且有符合設定的價格變動或新增商品時，自動發送到指定頻道。",
}: PublicPriceReportSettingsPanel & {
  title?: string;
  description?: string;
}): DiscordBotEmbed {
  const filters = toPublicPriceReportFilters(setting);
  const description = [notice ? `**${notice}**` : null, baseDescription]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    title,
    description,
    color: DISCORD_EMBED_COLOR,
    fields: [
      {
        name: "狀態",
        value: setting
          ? setting.enabled
            ? "已啟用，自動發送中"
            : "已暫停，不會自動發送"
          : "尚未設定",
        inline: true,
      },
      {
        name: "發送頻道",
        value: setting ? `<#${setting.channelId}>` : "尚未設定",
        inline: true,
      },
      {
        name: "目前頻道",
        value: `<#${currentChannelId}>`,
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
        name: "最多列出",
        value: `${setting?.maxItems ?? options.priceReportMaxItems} 筆`,
        inline: true,
      },
      {
        name: "商品關鍵字",
        value: formatPriceReportKeywordFilterLabel(filters),
        inline: true,
      },
      {
        name: "最近一次公開報告",
        value: formatPublicReportDeliveryStatus(latestDelivery),
      },
      {
        name: "重試行為",
        value:
          "失敗或 Discord 限流的排程公開報告會在下一輪 bot 掃描時重試；已成功或已略過的輪次不會重送。",
      },
    ],
  };
}

// 將最近一次公開報告 delivery 狀態轉成面板欄位文字，保留重試語意給維運判讀。
function formatPublicReportDeliveryStatus(
  delivery: PublicPriceReportDeliveryStatus | null,
): string {
  if (!delivery) {
    return "尚無公開報告紀錄。";
  }

  const deliveredAt = formatTaipeiMinute(delivery.deliveredAt ?? delivery.createdAt);

  if (delivery.status === "SENT") {
    return `成功：${deliveredAt}，列出 ${delivery.itemCount} 筆，送出 ${delivery.messageCount} 則訊息。`;
  }

  if (delivery.status === "SKIPPED") {
    return `略過：${deliveredAt}，本輪沒有符合設定的公開報告內容，不會重送。`;
  }

  if (delivery.status === "RATE_LIMITED") {
    return `Discord 限流：${deliveredAt}。${formatDiscordRateLimitForUser()} 下一輪掃描會重試。`;
  }

  if (delivery.status === "FAILED") {
    return `失敗：${deliveredAt}。${formatPriceReportDeliveryError(delivery.errorMessage)} 下一輪掃描會重試。`;
  }

  return `${delivery.status}：${deliveredAt}，列出 ${delivery.itemCount} 筆。`;
}

// 摘要測試公開報告實際套用的分類、內容、關鍵字與列出上限。
function formatPublicReportSettingSummary(
  setting: PublicPriceReportSetting,
  categories: PriceReportCategoryOption[],
): string {
  const filters = toPublicPriceReportFilters(setting);

  return `套用設定：分類 ${formatPriceReportCategoryFilterLabel(
    filters,
    categories,
  )}；內容 ${formatPriceReportContentFilterLabel(filters)}；關鍵字 ${formatPriceReportKeywordFilterLabel(
    filters,
  )}；最多 ${setting.maxItems} 筆。`;
}

// 檢查 Discord permission bitset 是否包含指定權限，避免用字串比對權限組合。
function hasDiscordPermission(value: string | undefined, permission: bigint): boolean {
  const bitset = parseDiscordPermissionBitset(value);

  return bitset !== null && (bitset & permission) === permission;
}

// 將 Discord app_permissions 十進位字串轉為 bigint；非法值不丟錯，交由呼叫端視為無法確認。
function parseDiscordPermissionBitset(value: string | undefined): bigint | null {
  if (!value || !/^(0|[1-9][0-9]*)$/.test(value)) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

// 判斷 Discord API 回覆是否是缺少權限，讓 preview 失敗時能顯示可操作的修正提示。
function isDiscordMissingPermissionsError(message: string | null): boolean {
  const normalized = message?.toLowerCase() ?? "";

  return normalized.includes("code=50013") || normalized.includes("missing permissions");
}
