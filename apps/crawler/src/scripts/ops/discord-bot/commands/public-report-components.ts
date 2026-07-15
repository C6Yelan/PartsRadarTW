// apps/crawler/src/scripts/ops/discord-bot/commands/public-report-components.ts
// 產生 public-report 管理面板與 modal component，維持伺服器公開報告設定的 Discord UI contract。

import {
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_COMPONENT_TYPE_STRING_SELECT,
} from "../constants";
import type { DiscordMessageComponent, DiscordModal } from "../types";
import {
  PRICE_REPORT_CATEGORY_OPTION_LIMIT,
  PRICE_REPORT_CONTENT_NEW_PRODUCTS_VALUE,
  PRICE_REPORT_CONTENT_PRICE_DROPS_VALUE,
  PRICE_REPORT_CONTENT_PRICE_RISES_VALUE,
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
import { createProductKeywordModal } from "./keyword-modal";

// 建立 public-report 設定面板，依目前頻道設定狀態控制分類、篩選、測試與啟停操作。
export function createPublicReportSettingsComponents({
  hasChannel,
  enabled,
  categories,
  categoryIgrps,
  includePriceDrops,
  includePriceRises,
  includeNewProducts,
}: {
  hasChannel: boolean;
  enabled: boolean;
  categories: Array<{ igrp: number; displayName: string }>;
  categoryIgrps: number[];
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
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
                custom_id: PUBLIC_REPORT_CATEGORIES_CUSTOM_ID,
                placeholder: "公開報告分類",
                min_values: 1,
                max_values: Math.min(PRICE_REPORT_CATEGORY_OPTION_LIMIT, categoryOptions.length),
                options: categoryOptions,
                disabled: !hasChannel,
              },
            ],
          },
        ];

  return [
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
                custom_id: PUBLIC_REPORT_ALL_CATEGORIES_CUSTOM_ID,
                label: "改為全部分類",
                disabled: !hasChannel,
              },
            ],
          } satisfies DiscordMessageComponent,
        ]),
    {
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: PUBLIC_REPORT_CONTENT_FILTER_CUSTOM_ID,
          placeholder: "公開報告內容",
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
          disabled: !hasChannel,
        },
      ],
    },
    {
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_PRIMARY,
          custom_id: PUBLIC_REPORT_SET_CHANNEL_CUSTOM_ID,
          label: "設為此頻道",
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: PUBLIC_REPORT_PREVIEW_CUSTOM_ID,
          label: "發送測試",
          disabled: !hasChannel,
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_SECONDARY,
          custom_id: PUBLIC_REPORT_KEYWORD_CUSTOM_ID,
          label: "調整關鍵字",
          disabled: !hasChannel,
        },
      ],
    },
    {
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: enabled ? DISCORD_BUTTON_STYLE_DANGER : DISCORD_BUTTON_STYLE_PRIMARY,
          custom_id: enabled ? PUBLIC_REPORT_DISABLE_CUSTOM_ID : PUBLIC_REPORT_ENABLE_CUSTOM_ID,
          label: enabled ? "暫停公開報告" : "啟用公開報告",
          disabled: !hasChannel,
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_DANGER,
          custom_id: PUBLIC_REPORT_CLEAR_CUSTOM_ID,
          label: "清除設定",
          disabled: !hasChannel,
        },
      ],
    },
  ];
}

// 建立公開報告商品關鍵字 modal，與個人報告共用關鍵字格式說明與 parser 規則。
export function createPublicReportKeywordModal({
  keywordValue,
}: {
  keywordValue: string;
}): DiscordModal {
  return createProductKeywordModal({
    modalCustomId: PUBLIC_REPORT_KEYWORD_MODAL_CUSTOM_ID,
    inputCustomIds: PUBLIC_REPORT_KEYWORD_INPUT_CUSTOM_IDS,
    keywordValue,
  });
}
