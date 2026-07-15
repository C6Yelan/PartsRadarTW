// apps/crawler/src/scripts/ops/discord-bot/interactions/public-report-settings/messages.ts
// 組裝 public-report 設定面板、權限提醒與測試發送結果文字。

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
import type { DiscordBotEmbed, DiscordBotMessage, DiscordInteraction } from "../../types";

// public-report 設定面板訊息所需的資料契約，由設定讀取流程與 interaction handler 共用。
export interface PublicPriceReportSettingsPanel {
  setting: PublicPriceReportSetting | null;
  latestDelivery: PublicPriceReportDeliveryStatus | null;
  categories: PriceReportCategoryOption[];
  currentChannelId: string;
  notice?: string;
}

// 建立可互動的 public-report 設定面板，包含目前設定摘要與設定用 component。
export function createPublicPriceReportSettingsPanelMessage({
  setting,
  latestDelivery,
  categories,
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

  return `目前無法在 <#${channelId}> 發送訊息，請確認 bot 具備「${missing.join("」與「")}」權限。`;
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
    return `已將測試報告發送到 <#${channelId}>：價格變動 ${result.changeCount} 筆、新增商品 ${result.newProductCount} 筆，共列出 ${result.listedCount} 筆。\n${settingSummary}`;
  }

  if (result.status === "skipped") {
    return `過去 24 小時沒有符合目前設定的商品，因此未發送測試報告。\n${settingSummary}`;
  }

  if (result.status === "rate_limited") {
    return "Discord 暫時無法接收訊息，請稍後再試。";
  }

  if (result.errorCategory === "PERMISSIONS") {
    return `目前無法在 <#${channelId}> 發送訊息，請確認 bot 具備「傳送訊息」與「嵌入連結」權限。`;
  }

  return "發送失敗，請稍後再試。";
}

// 建立 public-report 設定 embed；互動面板與只讀狀態訊息共用相同欄位排列。
function createPublicPriceReportSettingsEmbed({
  setting,
  latestDelivery,
  categories,
  currentChannelId,
  notice,
  title = "公開價格報告設定",
  description:
    baseDescription = "設定公開報告要發送的頻道與內容。有符合條件的降價、漲價或新增商品時，bot 會自動發送。",
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
        value: setting ? (setting.enabled ? "已開啟" : "已暫停") : "尚未設定",
        inline: true,
      },
      {
        name: "發送頻道",
        value: setting ? `<#${setting.channelId}>` : "尚未設定",
        inline: true,
      },
      {
        name: "你目前所在的頻道",
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
        name: "商品名稱關鍵字",
        value: formatPriceReportKeywordFilterLabel(filters),
        inline: true,
      },
      {
        name: "最近一次發送",
        value: formatPublicReportDeliveryStatus(latestDelivery),
      },
      {
        name: "發送說明",
        value: "自動發送失敗時，bot 會稍後再試；「發送測試」只會傳送一次。",
      },
    ],
  };
}

// 將最近一次公開報告 delivery 狀態轉成管理員可讀的簡短文字。
function formatPublicReportDeliveryStatus(
  delivery: PublicPriceReportDeliveryStatus | null,
): string {
  if (!delivery) {
    return "尚無公開報告紀錄。";
  }

  const deliveredAt = formatTaipeiMinute(delivery.deliveredAt ?? delivery.updatedAt).replace(
    " GMT+8",
    "",
  );

  if (delivery.status === "SENT") {
    return `${deliveredAt}，已發送 ${delivery.itemCount} 筆商品。`;
  }

  if (delivery.status === "SKIPPED") {
    return `${deliveredAt}，當時沒有符合條件的商品。`;
  }

  if (delivery.status === "RATE_LIMITED") {
    return `${deliveredAt}，Discord 暫時無法接收訊息，bot 會稍後再試。`;
  }

  if (delivery.status === "FAILED") {
    return `${deliveredAt}，發送失敗，bot 會稍後再試。`;
  }

  return `${deliveredAt}，目前無法確認發送結果。`;
}

// 摘要測試公開報告實際套用的分類、內容與關鍵字。
function formatPublicReportSettingSummary(
  setting: PublicPriceReportSetting,
  categories: PriceReportCategoryOption[],
): string {
  const filters = toPublicPriceReportFilters(setting);

  return `套用設定：分類 ${formatPriceReportCategoryFilterLabel(filters, categories)}；內容 ${formatPriceReportContentFilterLabel(filters)}；關鍵字 ${formatPriceReportKeywordFilterLabel(filters)}。`;
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
