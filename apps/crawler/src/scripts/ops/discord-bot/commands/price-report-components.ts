// apps/crawler/src/scripts/ops/discord-bot/commands/price-report-components.ts
// 產生個人 price-report 設定面板與 modal component，讓 interaction handler 可重用同一組 Discord UI contract。

import {
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_COMPONENT_TYPE_LABEL,
  DISCORD_COMPONENT_TYPE_STRING_SELECT,
  DISCORD_COMPONENT_TYPE_TEXT_INPUT,
  DISCORD_TEXT_INPUT_STYLE_SHORT,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
} from "../constants";
import type { DiscordMessageComponent, DiscordModal } from "../types";
import {
  PRICE_REPORT_CATEGORY_OPTION_LIMIT,
  PRICE_REPORT_CONTENT_NEW_PRODUCTS_VALUE,
  PRICE_REPORT_CONTENT_PRICE_DROPS_VALUE,
  PRICE_REPORT_CONTENT_PRICE_RISES_VALUE,
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
} from "./ids";
import { splitProductKeywordInputGroups } from "./settings-input";

// 建立個人 price-report 設定面板的 select menu 與操作按鈕，對應 settings parser 的 custom_id contract。
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
  const categoryRows: DiscordMessageComponent[] =
    categoryOptions.length === 0
      ? []
      : [
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
        ];

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
    ...categoryRows,
    ...(allCategoriesSelected || categoryOptions.length === 0
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
          custom_id: PRICE_REPORT_SETTINGS_CONTENT_FILTER_CUSTOM_ID,
          placeholder: "報告內容",
          min_values: 1,
          max_values: 3,
          options: [
            {
              label: "降價",
              value: PRICE_REPORT_CONTENT_PRICE_DROPS_VALUE,
              default: includePriceDrops,
            },
            {
              label: "漲價",
              value: PRICE_REPORT_CONTENT_PRICE_RISES_VALUE,
              default: includePriceRises,
            },
            {
              label: "新增商品",
              value: PRICE_REPORT_CONTENT_NEW_PRODUCTS_VALUE,
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
          custom_id: PRICE_REPORT_SETTINGS_TIME_BUTTON_CUSTOM_ID,
          label: "調整時間",
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: enabled ? DISCORD_BUTTON_STYLE_DANGER : DISCORD_BUTTON_STYLE_PRIMARY,
          custom_id: enabled
            ? PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID
            : PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID,
          label: enabled ? "關閉每日私訊價格報告" : "開啟每日私訊價格報告",
        },
      ],
    },
  ];
}

// 建立每日私訊價格報告發送時間 modal；沿用既有 wire custom_id 以相容已發出的設定面板。
export function createPriceReportTimeModal({ timeValue }: { timeValue: string }): DiscordModal {
  return {
    custom_id: PRICE_REPORT_SETTINGS_TIME_MODAL_CUSTOM_ID,
    title: "每日私訊價格報告時間",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "每日私訊發送時間",
        description: "台北時間 HH:mm",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: PRICE_REPORT_SETTINGS_TIME_INPUT_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 4,
          max_length: 9,
          required: true,
          value: timeValue,
          placeholder: "09:00",
        },
      },
    ],
  };
}

// 建立商品名稱關鍵字設定 modal，保留格式說明並讓 parser 統一處理空值、分組與長度限制。
export function createPriceReportKeywordModal({
  keywordValue,
}: {
  keywordValue: string;
}): DiscordModal {
  const keywordGroups = splitProductKeywordInputGroups(keywordValue);

  return {
    custom_id: PRICE_REPORT_SETTINGS_KEYWORD_MODAL_CUSTOM_ID,
    title: "價格報告關鍵字",
    components: PRICE_REPORT_SETTINGS_KEYWORD_INPUT_CUSTOM_IDS.map((customId, index) => ({
      type: DISCORD_COMPONENT_TYPE_LABEL,
      label: `關鍵字組 ${index + 1}（不同格擇一）`,
      description: index === 0 ? "同一格以空白分隔，需全部符合；全部留空代表不限。" : undefined,
      component: {
        type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
        custom_id: customId,
        style: DISCORD_TEXT_INPUT_STYLE_SHORT,
        max_length: MAX_PRICE_REPORT_KEYWORD_LENGTH,
        required: false,
        value: keywordGroups[index] ?? "",
        placeholder: index === 0 ? "RTX 5090" : index === 1 ? "DDR5" : undefined,
      },
    })),
  };
}
