// apps/crawler/src/scripts/ops/discord-bot/commands.ts
// 集中提供 Discord slash command 定義、互動 parser、component builder 與 custom_id 常數出口。

// Discord bot 內部的 commands 模組邊界；互動 handler 透過此檔取得指令相關能力。
export {
  createBotCommand,
  createPriceReportCommand,
  createPublicReportCommand,
  createWatchCommand,
} from "./commands/definitions";
export {
  parseBotInteraction,
  parsePriceReportInteraction,
  parsePublicReportInteraction,
  parseWatchInteraction,
} from "./commands/application-parser";
export {
  parseTargetPriceWatchComponentInteraction,
  parseTargetPriceWatchModalSubmit,
} from "./commands/watch-parser";
export {
  parsePriceReportComponentInteraction,
  parsePriceReportModalSubmit,
  parsePublicReportComponentInteraction,
  parsePublicReportModalSubmit,
} from "./commands/settings-parser";
export { createWatchEditModal, createWatchModal } from "./commands/watch-components";
export {
  createPriceReportKeywordModal,
  createPriceReportSettingsComponents,
  createPriceReportTimeLimitModal,
} from "./commands/price-report-components";
export {
  createPublicReportKeywordModal,
  createPublicReportLimitModal,
  createPublicReportSettingsComponents,
} from "./commands/public-report-components";

export {
  WATCH_ADD_CUSTOM_ID,
  WATCH_BULK_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_SELECT_CUSTOM_ID_PREFIX,
  WATCH_EDIT_CUSTOM_ID_PREFIX,
  WATCH_FILTER_CUSTOM_ID_PREFIX,
  WATCH_PAGE_CUSTOM_ID_PREFIX,
  WATCH_REFRESH_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_SELECT_CUSTOM_ID_PREFIX,
  WATCH_SORT_CUSTOM_ID_PREFIX,
} from "./commands/ids";
