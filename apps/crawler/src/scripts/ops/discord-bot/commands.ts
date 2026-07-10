// apps/crawler/src/scripts/ops/discord-bot/commands.ts
// 集中提供 Discord slash command 定義、互動 parser、component builder 與 custom_id 常數出口。

export {
  parseBotInteraction,
  parsePriceReportInteraction,
  parsePublicReportInteraction,
  parseWatchInteraction,
} from "./commands/application-parser";
// Discord bot 內部的 commands 模組邊界；互動 handler 透過此檔取得指令相關能力。
export {
  createBotCommand,
  createPriceReportCommand,
  createPublicReportCommand,
  createWatchCommand,
} from "./commands/definitions";
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
export {
  createPriceReportKeywordModal,
  createPriceReportSettingsComponents,
  createPriceReportTimeModal,
} from "./commands/price-report-components";
export {
  createPublicReportKeywordModal,
  createPublicReportSettingsComponents,
} from "./commands/public-report-components";
export {
  parsePriceReportComponentInteraction,
  parsePriceReportModalSubmit,
  parsePublicReportComponentInteraction,
  parsePublicReportModalSubmit,
} from "./commands/settings-parser";
export { createWatchEditModal, createWatchModal } from "./commands/watch-components";
export {
  parseTargetPriceWatchComponentInteraction,
  parseTargetPriceWatchModalSubmit,
} from "./commands/watch-parser";
