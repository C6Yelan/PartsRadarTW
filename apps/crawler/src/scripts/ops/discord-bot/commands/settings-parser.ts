// apps/crawler/src/scripts/ops/discord-bot/commands/settings-parser.ts

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
  PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_EVENTS_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_KEYWORD_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_KEYWORD_INPUT_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_KEYWORD_MODAL_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_MAX_ITEMS_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_OPEN_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_PREVIEW_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_LIMIT_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_LIMIT_MODAL_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID,
  PUBLIC_REPORT_ALL_CATEGORIES_CUSTOM_ID,
  PUBLIC_REPORT_CATEGORIES_CUSTOM_ID,
  PUBLIC_REPORT_CLEAR_CUSTOM_ID,
  PUBLIC_REPORT_DISABLE_CUSTOM_ID,
  PUBLIC_REPORT_ENABLE_CUSTOM_ID,
  PUBLIC_REPORT_EVENTS_CUSTOM_ID,
  PUBLIC_REPORT_KEYWORD_CUSTOM_ID,
  PUBLIC_REPORT_KEYWORD_INPUT_CUSTOM_ID,
  PUBLIC_REPORT_KEYWORD_MODAL_CUSTOM_ID,
  PUBLIC_REPORT_LIMIT_CUSTOM_ID,
  PUBLIC_REPORT_LIMIT_MODAL_CUSTOM_ID,
  PUBLIC_REPORT_MAX_ITEMS_CUSTOM_ID,
  PUBLIC_REPORT_PREVIEW_CUSTOM_ID,
  PUBLIC_REPORT_SET_CHANNEL_CUSTOM_ID,
} from "./ids";
import {
  parseMaxItemsInput,
  parseProductKeywordInput,
  parseReportEvents,
  parseTimeOfDay,
  parseWindowHoursStrict,
} from "./settings-input";
import { readSubmittedComponentValue } from "./submitted-components";

export function parsePriceReportComponentInteraction(
  interaction: DiscordInteraction,
): ParsedPriceReportComponent | null {
  const customId = interaction.data?.custom_id;

  if (customId === PRICE_REPORT_SETTINGS_OPEN_CUSTOM_ID) {
    return {
      name: "open_time_limit_modal",
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID) {
    return {
      name: "enable_daily_report",
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_TIME_LIMIT_CUSTOM_ID) {
    return {
      name: "open_time_limit_modal",
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
      name: "disable_daily_report",
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

  if (customId === PRICE_REPORT_SETTINGS_EVENTS_CUSTOM_ID) {
    const events = parseReportEvents(interaction.data?.values ?? []);

    return events ? { name: "update_events", ...events } : null;
  }

  return null;
}

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

  if (customId === PUBLIC_REPORT_EVENTS_CUSTOM_ID) {
    const events = parseReportEvents(interaction.data?.values ?? []);

    return events ? { name: "update_events", ...events } : null;
  }

  if (customId === PUBLIC_REPORT_KEYWORD_CUSTOM_ID) {
    return { name: "open_keyword_modal" };
  }

  if (customId === PUBLIC_REPORT_LIMIT_CUSTOM_ID) {
    return { name: "open_limit_modal" };
  }

  return null;
}

export function parsePriceReportModalSubmit(
  interaction: DiscordInteraction,
): ParsedPriceReportModal | null {
  const data = interaction.data;

  if (!data) {
    return null;
  }

  const customId = data.custom_id;

  if (customId === PRICE_REPORT_SETTINGS_TIME_LIMIT_MODAL_CUSTOM_ID) {
    const maxItemsValue = readSubmittedComponentValue(
      data.components,
      PRICE_REPORT_SETTINGS_MAX_ITEMS_CUSTOM_ID,
    );
    const timeValue = readSubmittedComponentValue(
      data.components,
      PRICE_REPORT_SETTINGS_TIME_CUSTOM_ID,
    );
    const maxItems = parseMaxItemsInput(maxItemsValue);
    const timeOfDay = parseTimeOfDay(timeValue);

    return {
      name: "time_limit",
      maxItems,
      maxItemsInputValid: maxItems !== null,
      timeOfDay,
      timeInputValid: timeOfDay !== null,
    };
  }

  if (customId === PRICE_REPORT_SETTINGS_KEYWORD_MODAL_CUSTOM_ID) {
    const productKeywordValue = readSubmittedComponentValue(
      data.components,
      PRICE_REPORT_SETTINGS_KEYWORD_INPUT_CUSTOM_ID,
    );
    const productKeyword = parseProductKeywordInput(productKeywordValue);

    return {
      name: "keyword",
      productKeyword: productKeyword === undefined ? null : productKeyword,
      productKeywordInputValid: productKeyword !== undefined,
    };
  }

  return null;
}

export function parsePublicReportModalSubmit(
  interaction: DiscordInteraction,
): ParsedPublicReportModal | null {
  const data = interaction.data;

  if (!data) {
    return null;
  }

  if (data.custom_id === PUBLIC_REPORT_LIMIT_MODAL_CUSTOM_ID) {
    const maxItemsValue = readSubmittedComponentValue(
      data.components,
      PUBLIC_REPORT_MAX_ITEMS_CUSTOM_ID,
    );
    const maxItems = parseMaxItemsInput(maxItemsValue);

    return {
      name: "limit",
      maxItems,
      maxItemsInputValid: maxItems !== null,
    };
  }

  if (data.custom_id === PUBLIC_REPORT_KEYWORD_MODAL_CUSTOM_ID) {
    const productKeywordValue = readSubmittedComponentValue(
      data.components,
      PUBLIC_REPORT_KEYWORD_INPUT_CUSTOM_ID,
    );
    const productKeyword = parseProductKeywordInput(productKeywordValue);

    return {
      name: "keyword",
      productKeyword: productKeyword === undefined ? null : productKeyword,
      productKeywordInputValid: productKeyword !== undefined,
    };
  }

  return null;
}
