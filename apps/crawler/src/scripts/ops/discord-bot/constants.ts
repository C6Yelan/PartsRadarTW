// apps/crawler/src/scripts/ops/discord-bot/constants.ts
// 集中定義 Discord bot 的預設設定、排程限制、Discord API 數值常數與訊息長度上限。

// Bot 啟動與價格報告排程的部署預設值，實際值可由 options/env 覆寫。
export const DEFAULT_DISCORD_API_BASE_URL = "https://discord.com/api/v10";
export const DEFAULT_DISCORD_GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
export const DEFAULT_PUBLIC_BASE_URL = "https://partsradar.net";
export const MAX_PRICE_REPORT_ITEMS = 50;
export const MAX_PRICE_REPORT_KEYWORD_LENGTH = 80;
export const MAX_PRICE_REPORT_KEYWORD_GROUPS = 5;
export const DEFAULT_COMMAND_COOLDOWN_SECONDS = 60;
export const DEFAULT_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS = 300;
export const SCHEDULED_PRICE_REPORT_RETRY_DELAY_MS = 10 * 60 * 1000;

// 排程工作每輪最多處理數量，避免單輪 Discord 發送或 DB 查詢無界成長。
export const MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE = 25;
export const MAX_DUE_PUBLIC_PRICE_REPORT_SETTINGS_PER_CYCLE = 25;
export const MAX_DUE_PUBLIC_PRICE_REPORTS_PER_CYCLE = 10;
export const MAX_TARGET_PRICE_NOTIFICATIONS_PER_CYCLE = 25;
export const MAX_TARGET_PRICE_WATCHES_PER_USER = 50;
export const TARGET_PRICE_NOTIFICATION_CLAIM_LEASE_MS = 15 * 60 * 1000;
export const MAX_TARGET_PRICE = 99_999_999;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const TIME_ZONE = "Asia/Taipei";

// Discord API payload 使用的固定數值，對應官方 interaction/component/gateway protocol。
export const DISCORD_EPHEMERAL_MESSAGE_FLAG = 64;
export const DISCORD_COMMAND_TYPE_CHAT_INPUT = 1;
export const DISCORD_OPTION_TYPE_SUBCOMMAND = 1;
export const DISCORD_OPTION_TYPE_STRING = 3;
export const DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND = 2;
export const DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT = 3;
export const DISCORD_INTERACTION_TYPE_MODAL_SUBMIT = 5;
export const DISCORD_INTERACTION_CALLBACK_CHANNEL_MESSAGE = 4;
export const DISCORD_INTERACTION_CALLBACK_DEFERRED_CHANNEL_MESSAGE = 5;
export const DISCORD_INTERACTION_CALLBACK_DEFERRED_UPDATE_MESSAGE = 6;
export const DISCORD_INTERACTION_CALLBACK_MODAL = 9;
export const DISCORD_COMPONENT_TYPE_ACTION_ROW = 1;
export const DISCORD_COMPONENT_TYPE_BUTTON = 2;
export const DISCORD_COMPONENT_TYPE_STRING_SELECT = 3;
export const DISCORD_COMPONENT_TYPE_TEXT_INPUT = 4;
export const DISCORD_COMPONENT_TYPE_LABEL = 18;
export const DISCORD_BUTTON_STYLE_PRIMARY = 1;
export const DISCORD_BUTTON_STYLE_SECONDARY = 2;
export const DISCORD_BUTTON_STYLE_DANGER = 4;
export const DISCORD_BUTTON_STYLE_LINK = 5;
export const DISCORD_TEXT_INPUT_STYLE_SHORT = 1;
export const DISCORD_APPLICATION_CONTEXT_GUILD = 0;
export const DISCORD_APPLICATION_CONTEXT_BOT_DM = 1;
export const DISCORD_PERMISSION_ADMINISTRATOR = 8n;
export const DISCORD_PERMISSION_MANAGE_GUILD = 32n;
export const DISCORD_PERMISSION_SEND_MESSAGES = 2048n;
export const DISCORD_PERMISSION_EMBED_LINKS = 16384n;

// Discord 訊息與 embed 的顯示限制，送出 payload 前用於裁切與分段。
export const DISCORD_EMBED_COLOR = 0x2563eb;
export const DISCORD_TARGET_PRICE_REACHED_COLOR = 0x16a34a;
export const DISCORD_EMBED_MAX_FIELDS = 25;
export const DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH = 1024;
export const DISCORD_EMBED_TITLE_MAX_LENGTH = 256;
export const DISCORD_EMBED_DESCRIPTION_MAX_LENGTH = 4096;
export const DISCORD_EMBED_FOOTER_TEXT_MAX_LENGTH = 2048;
export const DISCORD_MESSAGE_CONTENT_MAX_LENGTH = 2000;
export const DISCORD_MESSAGE_EMBED_TOTAL_MAX_LENGTH = 6000;
export const PRODUCT_NAME_MAX_LENGTH = 96;

// Gateway opcode 與 WebSocket ready state，供 gateway loop 判斷連線事件。
export const GATEWAY_OP_DISPATCH = 0;
export const GATEWAY_OP_HEARTBEAT = 1;
export const GATEWAY_OP_IDENTIFY = 2;
export const GATEWAY_OP_RECONNECT = 7;
export const GATEWAY_OP_INVALID_SESSION = 9;
export const GATEWAY_OP_HELLO = 10;
export const GATEWAY_READY_STATE_OPEN = 1;

// Discord activity type 3 會在 Bot 狀態顯示為 Watching／正在觀賞。
export const DISCORD_ACTIVITY_TYPE_WATCHING = 3;

// Discord snowflake id 只接受數字字串，避免把明顯錯誤的 app/guild id 帶進 API 呼叫。
export const DISCORD_SNOWFLAKE_PATTERN = /^[0-9]{8,32}$/;
