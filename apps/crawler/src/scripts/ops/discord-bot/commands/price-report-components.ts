// apps/crawler/src/scripts/ops/discord-bot/commands/price-report-components.ts
import {
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_COMPONENT_TYPE_LABEL,
  DISCORD_COMPONENT_TYPE_STRING_SELECT,
  DISCORD_COMPONENT_TYPE_TEXT_DISPLAY,
  DISCORD_COMPONENT_TYPE_TEXT_INPUT,
  DISCORD_TEXT_INPUT_STYLE_SHORT,
  MAX_PRICE_REPORT_ITEMS,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
} from "../constants";
import type { DiscordMessageComponent, DiscordModal } from "../types";
import {
  PRICE_REPORT_CATEGORY_OPTION_LIMIT,
  PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE,
  PRICE_REPORT_EVENT_PRICE_DROPS_VALUE,
  PRICE_REPORT_EVENT_PRICE_RISES_VALUE,
  PRICE_REPORT_KEYWORD_FORMAT_DESCRIPTION,
  PRICE_REPORT_SETTINGS_ALL_CATEGORIES_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_CATEGORIES_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_EVENTS_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_KEYWORD_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_KEYWORD_INPUT_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_KEYWORD_MODAL_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_MAX_ITEMS_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_PREVIEW_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_LIMIT_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_TIME_LIMIT_MODAL_CUSTOM_ID,
  PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID,
} from "./ids";

export function createPriceReportSettingsComponents({
  windowHours,
  categories,
  categoryIgrps,
  includePriceDrops,
  includePriceRises,
  includeNewProducts,
  enabled,
}: {
  windowHours: number;
  categories: Array<{ igrp: number; displayName: string }>;
  categoryIgrps: number[];
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
  enabled: boolean;
}): DiscordMessageComponent[] {
  const selectedCategoryIgrps = new Set(categoryIgrps);
  const allCategoriesSelected = selectedCategoryIgrps.size === 0;
  const visibleCategories = categories.slice(0, PRICE_REPORT_CATEGORY_OPTION_LIMIT);
  const categoryOptions = visibleCategories.map((category) => ({
    label: category.displayName,
    value: String(category.igrp),
    default: allCategoriesSelected || selectedCategoryIgrps.has(category.igrp),
  }));

  return [
    {
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID,
          placeholder: "統計區間",
          min_values: 1,
          max_values: 1,
          options: [
            {
              label: "過去 24 小時",
              value: "24h",
              default: windowHours !== 12 && windowHours !== 6,
            },
            {
              label: "過去 12 小時",
              value: "12h",
              default: windowHours === 12,
            },
            {
              label: "過去 6 小時",
              value: "6h",
              default: windowHours === 6,
            },
          ],
        },
      ],
    },
    {
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: PRICE_REPORT_SETTINGS_CATEGORIES_CUSTOM_ID,
          placeholder: "分類篩選",
          min_values: 1,
          max_values: Math.min(PRICE_REPORT_CATEGORY_OPTION_LIMIT, categoryOptions.length),
          options: categoryOptions,
        },
      ],
    },
    ...(allCategoriesSelected
      ? []
      : [
          {
            type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
            components: [
              {
                type: DISCORD_COMPONENT_TYPE_BUTTON,
                style: DISCORD_BUTTON_STYLE_SECONDARY,
                custom_id: PRICE_REPORT_SETTINGS_ALL_CATEGORIES_CUSTOM_ID,
                label: "改為全部分類",
              },
            ],
          } satisfies DiscordMessageComponent,
        ]),
    {
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: PRICE_REPORT_SETTINGS_EVENTS_CUSTOM_ID,
          placeholder: "報告內容",
          min_values: 1,
          max_values: 3,
          options: [
            {
              label: "降價",
              value: PRICE_REPORT_EVENT_PRICE_DROPS_VALUE,
              default: includePriceDrops,
            },
            {
              label: "漲價",
              value: PRICE_REPORT_EVENT_PRICE_RISES_VALUE,
              default: includePriceRises,
            },
            {
              label: "新增商品",
              value: PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE,
              default: includeNewProducts,
            },
          ],
        },
      ],
    },
    {
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: PRICE_REPORT_SETTINGS_PREVIEW_CUSTOM_ID,
          label: "傳送預覽 DM",
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: PRICE_REPORT_SETTINGS_KEYWORD_CUSTOM_ID,
          label: "調整關鍵字",
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: PRICE_REPORT_SETTINGS_TIME_LIMIT_CUSTOM_ID,
          label: "調整時間與上限",
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: enabled ? DISCORD_BUTTON_STYLE_DANGER : DISCORD_BUTTON_STYLE_PRIMARY,
          custom_id: enabled
            ? PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID
            : PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID,
          label: enabled ? "關閉每日報告" : "開啟每日報告",
        },
      ],
    },
  ];
}

export function createPriceReportTimeLimitModal({
  maxItems,
  timeValue,
}: {
  maxItems: number;
  timeValue: string;
}): DiscordModal {
  return {
    custom_id: PRICE_REPORT_SETTINGS_TIME_LIMIT_MODAL_CUSTOM_ID,
    title: "每日報告時間與上限",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "最多列出的商品數",
        description: `1-${MAX_PRICE_REPORT_ITEMS}`,
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: PRICE_REPORT_SETTINGS_MAX_ITEMS_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 1,
          max_length: 2,
          required: true,
          value: String(maxItems),
          placeholder: "50",
        },
      },
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "每日私訊發送時間",
        description: "台北時間 HH:mm",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: PRICE_REPORT_SETTINGS_TIME_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 4,
          max_length: 5,
          required: true,
          value: timeValue,
          placeholder: "09:00",
        },
      },
    ],
  };
}

export function createPriceReportKeywordModal({
  keywordValue,
}: {
  keywordValue: string;
}): DiscordModal {
  return {
    custom_id: PRICE_REPORT_SETTINGS_KEYWORD_MODAL_CUSTOM_ID,
    title: "價格報告關鍵字",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_TEXT_DISPLAY,
        content: PRICE_REPORT_KEYWORD_FORMAT_DESCRIPTION,
      },
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "商品名稱關鍵字",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: PRICE_REPORT_SETTINGS_KEYWORD_INPUT_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          max_length: MAX_PRICE_REPORT_KEYWORD_LENGTH,
          required: false,
          value: keywordValue,
          placeholder: "RTX 5090, DDR5",
        },
      },
    ],
  };
}
