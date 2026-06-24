// apps/crawler/src/scripts/ops/discord-bot/commands.ts

import {
  DISCORD_APPLICATION_CONTEXT_BOT_DM,
  DISCORD_APPLICATION_CONTEXT_GUILD,
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_COMMAND_TYPE_CHAT_INPUT,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_COMPONENT_TYPE_LABEL,
  DISCORD_COMPONENT_TYPE_STRING_SELECT,
  DISCORD_COMPONENT_TYPE_TEXT_INPUT,
  DISCORD_OPTION_TYPE_INTEGER,
  DISCORD_OPTION_TYPE_STRING,
  DISCORD_OPTION_TYPE_SUBCOMMAND,
  DISCORD_TEXT_INPUT_STYLE_SHORT,
  MAX_PRICE_REPORT_ITEMS,
  MAX_TARGET_PRICE,
} from "./constants";
import type {
  DiscordInteraction,
  DiscordInteractionComponent,
  DiscordMessageComponent,
  DiscordModal,
  ParsedPriceReportCommand,
  ParsedPriceReportComponent,
  ParsedPriceReportModal,
  ParsedWatchComponent,
  ParsedWatchModal,
} from "./types";

const PRICE_REPORT_SETTINGS_OPEN_CUSTOM_ID = "price-report:settings:open";
const PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID = "price-report:settings:enable";
const PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID = "price-report:settings:disable";
const PRICE_REPORT_SETTINGS_TIME_LIMIT_CUSTOM_ID = "price-report:settings:time-limit";
const PRICE_REPORT_SETTINGS_TIME_LIMIT_MODAL_CUSTOM_ID = "price-report:settings:time-limit-modal";
const PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID = "price-report:settings:window";
const PRICE_REPORT_SETTINGS_CATEGORIES_CUSTOM_ID = "price-report:settings:categories";
const PRICE_REPORT_SETTINGS_ALL_CATEGORIES_CUSTOM_ID = "price-report:settings:all-categories";
const PRICE_REPORT_SETTINGS_EVENTS_CUSTOM_ID = "price-report:settings:events";
const PRICE_REPORT_SETTINGS_MAX_ITEMS_CUSTOM_ID = "price-report:settings:max-items";
const PRICE_REPORT_SETTINGS_TIME_CUSTOM_ID = "price-report:settings:time";
const PRICE_REPORT_EVENT_PRICE_DROPS_VALUE = "price_drops";
const PRICE_REPORT_EVENT_PRICE_RISES_VALUE = "price_rises";
const PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE = "new_products";
const PRICE_REPORT_CATEGORY_OPTION_LIMIT = 25;
const WATCH_CREATE_MODAL_CUSTOM_ID = "watch:create-modal";
const WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX = "watch:edit-modal:";
const WATCH_PRODUCT_CUSTOM_ID = "watch:product";
const WATCH_TARGET_PRICE_CUSTOM_ID = "watch:target-price";
export const WATCH_ADD_CUSTOM_ID = "watch:add";
export const WATCH_SELECT_CUSTOM_ID_PREFIX = "watch:select:";
export const WATCH_EDIT_CUSTOM_ID_PREFIX = "watch:edit:";
export const WATCH_REMOVE_CUSTOM_ID_PREFIX = "watch:remove:";
export const WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX = "watch:remove-confirm:";
export const WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX = "watch:remove-cancel:";
export const WATCH_REFRESH_CUSTOM_ID_PREFIX = "watch:refresh:";
export const WATCH_PAGE_CUSTOM_ID_PREFIX = "watch:page:";

export function createPriceReportCommand(): Record<string, unknown> {
  return {
    name: "price-report",
    description: "Send PartsRadarTW price change reports.",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
    options: [
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "now",
        description: "立即在目前頻道或私訊顯示價格報告。",
        options: [
          {
            type: DISCORD_OPTION_TYPE_STRING,
            name: "window",
            description: "報告統計區間。",
            required: false,
            choices: [
              { name: "過去 24 小時", value: "24h" },
              { name: "過去 12 小時", value: "12h" },
              { name: "過去 6 小時", value: "6h" },
            ],
          },
          {
            type: DISCORD_OPTION_TYPE_INTEGER,
            name: "max_items",
            description: "最多列出的商品數。",
            required: false,
            min_value: 1,
            max_value: MAX_PRICE_REPORT_ITEMS,
          },
        ],
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "settings",
        description: "查看並管理每日價格報告設定。",
      },
    ],
  };
}

export function createWatchCommand(): Record<string, unknown> {
  return {
    name: "watch",
    description: "設定與管理商品目標價格，集中查看目前價格及追蹤狀態。",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
  };
}

export function parsePriceReportInteraction(
  interaction: DiscordInteraction,
): ParsedPriceReportCommand | null {
  if (interaction.data?.name !== "price-report") {
    return null;
  }

  const subcommand = interaction.data.options?.find(
    (option) => option.type === DISCORD_OPTION_TYPE_SUBCOMMAND,
  );

  if (!subcommand) {
    return null;
  }

  const windowOption = subcommand.options?.find((option) => option.name === "window");
  const maxItemsOption = subcommand.options?.find((option) => option.name === "max_items");

  if (subcommand.name === "now") {
    return {
      name: subcommand.name,
      windowHours: windowOption ? parseWindowHours(windowOption.value) : null,
      maxItems: parseMaxItems(maxItemsOption?.value),
    };
  }

  if (subcommand.name === "settings") {
    return {
      name: subcommand.name,
    };
  }

  return null;
}

export function parseWatchComponentInteraction(
  interaction: DiscordInteraction,
): ParsedWatchComponent | null {
  const customId = interaction.data?.custom_id;

  if (customId === WATCH_ADD_CUSTOM_ID) {
    return { action: "add" };
  }

  if (customId?.startsWith(WATCH_SELECT_CUSTOM_ID_PREFIX)) {
    const page = parsePage(customId.slice(WATCH_SELECT_CUSTOM_ID_PREFIX.length));
    const selectedValue = interaction.data?.values?.[0];

    return {
      action: "select",
      watchInput:
        typeof selectedValue === "string" && selectedValue.trim() ? selectedValue.trim() : null,
      page,
    };
  }

  const edit = parseWatchActionCustomId(customId, WATCH_EDIT_CUSTOM_ID_PREFIX, true);

  if (edit) {
    return {
      action: "edit",
      watchInput: edit.watchInput,
      targetPrice: edit.targetPrice,
      page: edit.page,
    };
  }

  const remove = parseWatchActionCustomId(customId, WATCH_REMOVE_CUSTOM_ID_PREFIX);

  if (remove) {
    return { action: "remove", watchInput: remove.watchInput, page: remove.page };
  }

  const confirmRemove = parseWatchActionCustomId(customId, WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX);

  if (confirmRemove) {
    return {
      action: "confirm_remove",
      watchInput: confirmRemove.watchInput,
      page: confirmRemove.page,
    };
  }

  const cancelRemove = parseWatchActionCustomId(customId, WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX);

  if (cancelRemove) {
    return {
      action: "cancel_remove",
      watchInput: cancelRemove.watchInput,
      page: cancelRemove.page,
    };
  }

  if (customId?.startsWith(WATCH_REFRESH_CUSTOM_ID_PREFIX)) {
    return {
      action: "refresh",
      page: parsePage(customId.slice(WATCH_REFRESH_CUSTOM_ID_PREFIX.length)),
    };
  }

  if (customId?.startsWith(WATCH_PAGE_CUSTOM_ID_PREFIX)) {
    return {
      action: "page",
      page: parsePage(customId.slice(WATCH_PAGE_CUSTOM_ID_PREFIX.length)),
    };
  }

  return null;
}

export function parseWatchInteraction(interaction: DiscordInteraction): boolean {
  return interaction.data?.name === "watch";
}

function parseWatchActionCustomId(
  customId: string | undefined,
  prefix: string,
  includesTargetPrice = false,
): { watchInput: string | null; targetPrice: number | null; page: number } | null {
  if (!customId?.startsWith(prefix)) {
    return null;
  }

  const segments = customId.slice(prefix.length).split(":");
  const watchId = segments[0]?.trim();
  const targetPrice = includesTargetPrice ? parseTargetPriceInput(segments[1]) : null;
  const page = parsePage(segments[includesTargetPrice ? 2 : 1]);

  return {
    watchInput: watchId ? `watch:${watchId}` : null,
    targetPrice,
    page,
  };
}

function parsePage(value: unknown): number {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    return 0;
  }

  const page = Number(value);

  return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

export function createWatchModal({
  productValue = "",
  targetPriceValue = "",
}: {
  productValue?: string;
  targetPriceValue?: string;
} = {}): DiscordModal {
  return {
    custom_id: WATCH_CREATE_MODAL_CUSTOM_ID,
    title: "新增商品目標價",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "PartsRadarTW 商品",
        description: "貼上商品頁完整網址，或輸入網址 /products/ 後面的商品 ID。",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: WATCH_PRODUCT_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 1,
          max_length: 300,
          required: true,
          ...(productValue ? { value: productValue } : {}),
          placeholder: "https://partsradar.net/products/...",
        },
      },
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "理想入手價格（新台幣）",
        description: "輸入希望入手的價格，只填整數，不要加 NT$、逗號或空格。",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: WATCH_TARGET_PRICE_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 1,
          max_length: String(MAX_TARGET_PRICE).length,
          required: true,
          ...(targetPriceValue ? { value: targetPriceValue } : {}),
          placeholder: "17500",
        },
      },
    ],
  };
}

export function createWatchEditModal({
  watchId,
  targetPrice,
  page,
}: {
  watchId: string;
  targetPrice: number;
  page: number;
}): DiscordModal {
  return {
    custom_id: `${WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX}${watchId}:${page}`,
    title: "修改商品目標價",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "新的目標價格（新台幣）",
        description: "只會修改目前選取的商品；請填整數，不要加 NT$、逗號或空格。",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: WATCH_TARGET_PRICE_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 1,
          max_length: String(MAX_TARGET_PRICE).length,
          required: true,
          value: String(targetPrice),
          placeholder: "17500",
        },
      },
    ],
  };
}

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
    const events = parsePriceReportEvents(interaction.data?.values ?? []);

    return events ? { name: "update_events", ...events } : null;
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

  if (customId !== PRICE_REPORT_SETTINGS_TIME_LIMIT_MODAL_CUSTOM_ID) {
    return null;
  }

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
    maxItems,
    maxItemsInputValid: maxItems !== null,
    timeOfDay,
    timeInputValid: timeOfDay !== null,
  };
}

export function parseWatchModalSubmit(interaction: DiscordInteraction): ParsedWatchModal | null {
  const customId = interaction.data?.custom_id;
  const targetPriceValue = readSubmittedComponentValue(
    interaction.data?.components,
    WATCH_TARGET_PRICE_CUSTOM_ID,
  );
  const targetPrice = parseTargetPriceInput(targetPriceValue);

  if (customId === WATCH_CREATE_MODAL_CUSTOM_ID) {
    const productValue = readSubmittedComponentValue(
      interaction.data?.components,
      WATCH_PRODUCT_CUSTOM_ID,
    );
    const productInput = typeof productValue === "string" ? productValue.trim() : "";

    return {
      action: "create",
      productInput: productInput.length > 0 ? productInput : null,
      productInputValid: productInput.length > 0,
      targetPrice,
      targetPriceInputValid: targetPrice !== null,
    };
  }

  if (customId?.startsWith(WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX)) {
    const [watchId, pageValue] = customId
      .slice(WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX.length)
      .split(":");

    return {
      action: "edit",
      watchInput: watchId ? `watch:${watchId}` : null,
      page: parsePage(pageValue),
      targetPrice,
      targetPriceInputValid: targetPrice !== null,
    };
  }

  return null;
}

function parseWindowHours(value: unknown): number {
  if (value === "6h") {
    return 6;
  }

  if (value === "12h") {
    return 12;
  }

  return 24;
}

function parseMaxItems(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return null;
  }

  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}

function parseWindowHoursStrict(value: unknown): number | null {
  if (value === "6h") {
    return 6;
  }

  if (value === "12h") {
    return 12;
  }

  if (value === "24h") {
    return 24;
  }

  return null;
}

function parseMaxItemsInput(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.trim())) {
    return null;
  }

  const maxItems = Number(value.trim());

  return Number.isSafeInteger(maxItems) && maxItems >= 1 && maxItems <= MAX_PRICE_REPORT_ITEMS
    ? maxItems
    : null;
}

function parsePriceReportEvents(values: unknown[]): {
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
} | null {
  const validValues = new Set([
    PRICE_REPORT_EVENT_PRICE_DROPS_VALUE,
    PRICE_REPORT_EVENT_PRICE_RISES_VALUE,
    PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE,
  ]);

  if (
    values.length === 0 ||
    values.some((value) => typeof value !== "string" || !validValues.has(value))
  ) {
    return null;
  }

  return {
    includePriceDrops: values.includes(PRICE_REPORT_EVENT_PRICE_DROPS_VALUE),
    includePriceRises: values.includes(PRICE_REPORT_EVENT_PRICE_RISES_VALUE),
    includeNewProducts: values.includes(PRICE_REPORT_EVENT_NEW_PRODUCTS_VALUE),
  };
}

function parseTargetPriceInput(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.trim())) {
    return null;
  }

  const targetPrice = Number(value.trim());

  return Number.isSafeInteger(targetPrice) && targetPrice >= 1 && targetPrice <= MAX_TARGET_PRICE
    ? targetPrice
    : null;
}

function parseTimeOfDay(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function readSubmittedComponentValue(
  components: DiscordInteractionComponent[] | undefined,
  customId: string,
): unknown {
  for (const component of components ?? []) {
    if (component.custom_id === customId) {
      return component.values?.[0] ?? component.value;
    }

    if (component.component) {
      const value = readSubmittedComponentValue([component.component], customId);

      if (value !== undefined) {
        return value;
      }
    }

    const value = readSubmittedComponentValue(component.components, customId);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}
