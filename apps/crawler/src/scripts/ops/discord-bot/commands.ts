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
} from "./constants";
import type {
  DiscordInteraction,
  DiscordInteractionComponent,
  DiscordMessageComponent,
  DiscordModal,
  ParsedPriceReportCommand,
  ParsedPriceReportComponent,
  ParsedPriceReportModal,
} from "./types";

const PRICE_REPORT_SETTINGS_OPEN_CUSTOM_ID = "price-report:settings:open";
const PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID = "price-report:settings:disable";
const PRICE_REPORT_SETTINGS_MODAL_CUSTOM_ID = "price-report:settings:modal";
const PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID = "price-report:settings:window";
const PRICE_REPORT_SETTINGS_MAX_ITEMS_CUSTOM_ID = "price-report:settings:max-items";
const PRICE_REPORT_SETTINGS_TIME_CUSTOM_ID = "price-report:settings:time";

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

export function parsePriceReportInteraction(interaction: DiscordInteraction): ParsedPriceReportCommand | null {
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
