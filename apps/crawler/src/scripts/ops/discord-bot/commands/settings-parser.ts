// apps/crawler/src/scripts/ops/discord-bot/commands/settings-parser.ts
// 解析 price-report 與 public-report 設定面板的 component interaction 與 modal submit payload。

import type {
  DiscordInteraction,
  ParsedPriceReportComponent,
  ParsedPriceReportModal,
  ParsedPublicReportComponent,
  ParsedPublicReportModal,
} from "../types";
import {
  PRICE_REPORT_SETTINGS_ALL_CATEGORIES_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_CATEGORIES_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_CONTENT_FILTER_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_KEYWORD_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_KEYWORD_INPUT_CUSTOM_IDS,
  PRICE_REPORT_SETTINGS_KEYWORD_MODAL_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_PREVIEW_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_BUTTON_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_INPUT_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_MODAL_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID,
  PUBLIC_REPORT_ALL_CATEGORIES_CUSTOM_ID,
  PUBLIC_REPORT_CATEGORIES_CUSTOM_ID,
  PUBLIC_REPORT_CLEAR_CUSTOM_ID,
  PUBLIC_REPORT_CONTENT_FILTER_CUSTOM_ID,
  PUBLIC_REPORT_DISABLE_CUSTOM_ID,
  PUBLIC_REPORT_ENABLE_CUSTOM_ID,
  PUBLIC_REPORT_KEYWORD_CUSTOM_ID,
  PUBLIC_REPORT_KEYWORD_INPUT_CUSTOM_IDS,
  PUBLIC_REPORT_KEYWORD_MODAL_CUSTOM_ID,
  PUBLIC_REPORT_PREVIEW_CUSTOM_ID,
  PUBLIC_REPORT_SET_CHANNEL_CUSTOM_ID,
} from "./ids";
import {
  parseProductKeywordInputs,
  parseReportContentFilters,
  parseTimeOfDay,
  parseWindowHoursStrict,
} from "./settings-input";
import { readSubmittedComponentValue } from "./submitted-components";

// 將個人 price-report 設定面板的 button/select custom_id 收斂成 handler 可分派的 component command。
export function parsePriceReportComponentInteraction(
  interaction: DiscordInteraction,
): ParsedPriceReportComponent | null {
  const customId = interaction.data?.custom_id;

  if (customId === PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID) {
    return {
      name: "enable_daily_scheduled_report",
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_TIME_BUTTON_CUSTOM_ID) {
    return {
      name: "open_time_modal",
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_KEYWORD_CUSTOM_ID) {
    return {
      name: "open_keyword_modal",
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_PREVIEW_CUSTOM_ID) {
    return {
      name: "preview_report",
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID) {
    return {
      name: "disable_daily_scheduled_report",
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_ALL_CATEGORIES_CUSTOM_ID) {
    return {
      name: "update_all_categories",
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID) {
    const windowHours = parseWindowHoursStrict(interaction.data?.values?.[0]);

    return windowHours ? { name: "update_window", windowHours } : null;
  }

  if (customId === PRICE_REPORT_SETTINGS_CATEGORIES_CUSTOM_ID) {
    return {
      name: "update_categories",
      values: interaction.data?.values ?? [],
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_CONTENT_FILTER_CUSTOM_ID) {
    const contentFilters = parseReportContentFilters(interaction.data?.values ?? []);

    return contentFilters ? { name: "update_content_filters", ...contentFilters } : null;
  }

  return null;
}

// 將 public-report 管理面板的 button/select custom_id 收斂成 handler 可分派的 component command。
export function parsePublicReportComponentInteraction(
  interaction: DiscordInteraction,
): ParsedPublicReportComponent | null {
  const customId = interaction.data?.custom_id;

  if (customId === PUBLIC_REPORT_SET_CHANNEL_CUSTOM_ID) {
    return { name: "set_channel" };
  }

  if (customId === PUBLIC_REPORT_ENABLE_CUSTOM_ID) {
    return { name: "enable" };
  }

  if (customId === PUBLIC_REPORT_DISABLE_CUSTOM_ID) {
    return { name: "disable" };
  }

  if (customId === PUBLIC_REPORT_PREVIEW_CUSTOM_ID) {
    return { name: "preview" };
  }

  if (customId === PUBLIC_REPORT_CLEAR_CUSTOM_ID) {
    return { name: "clear" };
  }

  if (customId === PUBLIC_REPORT_CATEGORIES_CUSTOM_ID) {
    return {
      name: "update_categories",
      values: interaction.data?.values ?? [],
    };
  }

  if (customId === PUBLIC_REPORT_ALL_CATEGORIES_CUSTOM_ID) {
    return { name: "update_all_categories" };
  }

  if (customId === PUBLIC_REPORT_CONTENT_FILTER_CUSTOM_ID) {
    const contentFilters = parseReportContentFilters(interaction.data?.values ?? []);

    return contentFilters ? { name: "update_content_filters", ...contentFilters } : null;
  }

  if (customId === PUBLIC_REPORT_KEYWORD_CUSTOM_ID) {
    return { name: "open_keyword_modal" };
  }

  return null;
}

// 解析個人 price-report modal submit，保留輸入值與驗證結果，讓 handler 決定錯誤回覆或寫入設定。
export function parsePriceReportModalSubmit(
  interaction: DiscordInteraction,
): ParsedPriceReportModal | null {
  const data = interaction.data;

  if (!data) {
    return null;
  }

  const customId = data.custom_id;

  if (customId === PRICE_REPORT_SETTINGS_TIME_MODAL_CUSTOM_ID) {
    const timeValue = readSubmittedComponentValue(
      data.components,
      PRICE_REPORT_SETTINGS_TIME_INPUT_CUSTOM_ID,
    );
    const timeOfDay = parseTimeOfDay(timeValue);

    return {
      name: "time",
      timeOfDay,
      timeInputValid: timeOfDay !== null,
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_KEYWORD_MODAL_CUSTOM_ID) {
    const productKeyword = parseProductKeywordInputs(
      PRICE_REPORT_SETTINGS_KEYWORD_INPUT_CUSTOM_IDS.map((customId) =>
        readSubmittedComponentValue(data.components, customId),
      ),
    );

    return {
      name: "keyword",
      productKeyword: productKeyword === undefined ? null : productKeyword,
      productKeywordInputValid: productKeyword !== undefined,
    };
  }

  return null;
}

// 解析 public-report modal submit，和個人報告共用輸入驗證規則但輸出 public-report 專用 command。
export function parsePublicReportModalSubmit(
  interaction: DiscordInteraction,
): ParsedPublicReportModal | null {
  const data = interaction.data;

  if (!data) {
    return null;
  }

  if (data.custom_id === PUBLIC_REPORT_KEYWORD_MODAL_CUSTOM_ID) {
    const productKeyword = parseProductKeywordInputs(
      PUBLIC_REPORT_KEYWORD_INPUT_CUSTOM_IDS.map((customId) =>
        readSubmittedComponentValue(data.components, customId),
      ),
    );

    return {
      name: "keyword",
      productKeyword: productKeyword === undefined ? null : productKeyword,
      productKeywordInputValid: productKeyword !== undefined,
    };
  }

  return null;
}
