// apps/crawler/src/scripts/ops/discord-bot/commands.ts

import {
  DISCORD_APPLICATION_CONTEXT_BOT_DM,
  DISCORD_APPLICATION_CONTEXT_GUILD,
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
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
  ParsedUnwatchCommand,
  ParsedUnwatchComponent,
  ParsedWatchCommand,
  ParsedWatchModal,
} from "./types";

const PRICE_REPORT_SETTINGS_OPEN_CUSTOM_ID = "price-report:settings:open";
const PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID = "price-report:settings:disable";
const PRICE_REPORT_SETTINGS_MODAL_CUSTOM_ID = "price-report:settings:modal";
const PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID = "price-report:settings:window";
const PRICE_REPORT_SETTINGS_MAX_ITEMS_CUSTOM_ID = "price-report:settings:max-items";
const PRICE_REPORT_SETTINGS_TIME_CUSTOM_ID = "price-report:settings:time";
const WATCH_MODAL_CUSTOM_ID = "watch:modal";
const WATCH_PRODUCT_CUSTOM_ID = "watch:product";
const WATCH_TARGET_PRICE_CUSTOM_ID = "watch:target-price";
export const UNWATCH_SELECT_CUSTOM_ID = "unwatch:select";
export const UNWATCH_CONFIRM_CUSTOM_ID_PREFIX = "unwatch:confirm:";
export const UNWATCH_CANCEL_CUSTOM_ID = "unwatch:cancel";

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
    description: "Open a form to set a PartsRadarTW target price alert.",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
  };
}

export function createWatchlistCommand(): Record<string, unknown> {
  return {
    name: "watchlist",
    description: "Show your PartsRadarTW target price alerts.",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
  };
}

export function createUnwatchCommand(): Record<string, unknown> {
  return {
    name: "unwatch",
    description: "Disable a PartsRadarTW target price alert.",
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
      windowHours: parseWindowHours(windowOption?.value),
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

export function parseWatchlistInteraction(interaction: DiscordInteraction): boolean {
  return interaction.data?.name === "watchlist";
}

export function parseUnwatchInteraction(
  interaction: DiscordInteraction,
): ParsedUnwatchCommand | null {
  if (interaction.data?.name !== "unwatch") {
    return null;
  }

  const watchOption = interaction.data.options?.find((option) => option.name === "watch_id");
  const watchInput = typeof watchOption?.value === "string" ? watchOption.value.trim() : "";

  return {
    watchInput: watchInput.length > 0 ? watchInput : null,
  };
}

export function parseUnwatchComponentInteraction(
  interaction: DiscordInteraction,
): ParsedUnwatchComponent | null {
  const customId = interaction.data?.custom_id;

  if (customId === UNWATCH_SELECT_CUSTOM_ID) {
    const selectedValue = interaction.data?.values?.[0];

    return {
      action: "select",
      watchInput:
        typeof selectedValue === "string" && selectedValue.trim() ? selectedValue.trim() : null,
    };
  }

  if (customId?.startsWith(UNWATCH_CONFIRM_CUSTOM_ID_PREFIX)) {
    const watchInput = customId.slice(UNWATCH_CONFIRM_CUSTOM_ID_PREFIX.length).trim();

    return {
      action: "confirm",
      watchInput: watchInput.length > 0 ? watchInput : null,
    };
  }

  if (customId === UNWATCH_CANCEL_CUSTOM_ID) {
    return {
      action: "cancel",
      watchInput: null,
    };
  }

  return null;
}

export function parseWatchInteraction(interaction: DiscordInteraction): ParsedWatchCommand | null {
  if (interaction.data?.name !== "watch") {
    return null;
  }

  const productOption = interaction.data.options?.find((option) => option.name === "product");
  const targetPriceOption = interaction.data.options?.find(
    (option) => option.name === "target_price",
  );
  const productInput = typeof productOption?.value === "string" ? productOption.value.trim() : "";
  const targetPrice =
    typeof targetPriceOption?.value === "number" &&
    Number.isInteger(targetPriceOption.value) &&
    targetPriceOption.value >= 1 &&
    targetPriceOption.value <= MAX_TARGET_PRICE
      ? targetPriceOption.value
      : null;

  return {
    productInput: productInput.length > 0 ? productInput : null,
    targetPrice,
  };
}

export function createWatchModal({
  productValue = "",
  targetPriceValue = "",
}: {
  productValue?: string;
  targetPriceValue?: string;
} = {}): DiscordModal {
  return {
    custom_id: WATCH_MODAL_CUSTOM_ID,
    title: "新增目標價追蹤",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "商品連結或商品 ID",
        description: "到 PartsRadarTW 商品頁按分享/複製連結，或複製網址列的 /products/...。",
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
        label: "目標價格",
        description: "輸入希望提醒的價格，純數字即可，不要加 NT$、逗號或空格。",
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

export function createPriceReportSettingsComponents(): DiscordMessageComponent[] {
  return [
    {
      type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
      components: [
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_PRIMARY,
          custom_id: PRICE_REPORT_SETTINGS_OPEN_CUSTOM_ID,
          label: "開啟/修改每日報告",
        },
        {
          type: DISCORD_COMPONENT_TYPE_BUTTON,
          style: DISCORD_BUTTON_STYLE_DANGER,
          custom_id: PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID,
          label: "關閉每日報告",
        },
      ],
    },
  ];
}

export function createPriceReportSettingsModal({
  windowHours,
  maxItems,
  timeValue,
}: {
  windowHours: number;
  maxItems: number;
  timeValue: string;
}): DiscordModal {
  return {
    custom_id: PRICE_REPORT_SETTINGS_MODAL_CUSTOM_ID,
    title: "每日價格報告設定",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "統計區間",
        component: {
          type: DISCORD_COMPONENT_TYPE_STRING_SELECT,
          custom_id: PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID,
          required: true,
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
      },
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
  if (interaction.data?.custom_id === PRICE_REPORT_SETTINGS_OPEN_CUSTOM_ID) {
    return {
      name: "open_settings_modal",
    };
  }

  if (interaction.data?.custom_id === PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID) {
    return {
      name: "disable_daily_report",
    };
  }

  return null;
}

export function parsePriceReportModalSubmit(
  interaction: DiscordInteraction,
): ParsedPriceReportModal | null {
  if (interaction.data?.custom_id !== PRICE_REPORT_SETTINGS_MODAL_CUSTOM_ID) {
    return null;
  }

  const windowValue = readSubmittedComponentValue(
    interaction.data.components,
    PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID,
  );
  const maxItemsValue = readSubmittedComponentValue(
    interaction.data.components,
    PRICE_REPORT_SETTINGS_MAX_ITEMS_CUSTOM_ID,
  );
  const timeValue = readSubmittedComponentValue(
    interaction.data.components,
    PRICE_REPORT_SETTINGS_TIME_CUSTOM_ID,
  );
  const windowHours = parseWindowHoursStrict(windowValue);
  const maxItems = parseMaxItemsInput(maxItemsValue);
  const timeOfDay = parseTimeOfDay(timeValue);

  return {
    windowHours: windowHours ?? 24,
    windowInputValid: windowHours !== null,
    maxItems,
    maxItemsInputValid: maxItems !== null,
    timeOfDay,
    timeInputValid: timeOfDay !== null,
  };
}

export function parseWatchModalSubmit(interaction: DiscordInteraction): ParsedWatchModal | null {
  if (interaction.data?.custom_id !== WATCH_MODAL_CUSTOM_ID) {
    return null;
  }

  const productValue = readSubmittedComponentValue(
    interaction.data.components,
    WATCH_PRODUCT_CUSTOM_ID,
  );
  const targetPriceValue = readSubmittedComponentValue(
    interaction.data.components,
    WATCH_TARGET_PRICE_CUSTOM_ID,
  );
  const productInput = typeof productValue === "string" ? productValue.trim() : "";
  const targetPrice = parseTargetPriceInput(targetPriceValue);

  return {
    productInput: productInput.length > 0 ? productInput : null,
    productInputValid: productInput.length > 0,
    targetPrice,
    targetPriceInputValid: targetPrice !== null,
  };
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
