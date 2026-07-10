// apps/crawler/src/scripts/ops/discord-bot/commands/ids.ts
// 集中定義 Discord component custom_id 與 select value，讓元件產生與 interaction parser 共用同一組穩定識別字。

// 個人 price-report 設定面板、modal 與 select menu 使用的 component id。
export const PRICE_REPORT_SETTINGS_ENABLE_CUSTOM_ID = "price-report:settings:enable";
export const PRICE_REPORT_SETTINGS_DISABLE_CUSTOM_ID = "price-report:settings:disable";
export const PRICE_REPORT_SETTINGS_TIME_BUTTON_CUSTOM_ID = "price-report:settings:time-limit";
export const PRICE_REPORT_SETTINGS_TIME_MODAL_CUSTOM_ID = "price-report:settings:time-limit-modal";
export const PRICE_REPORT_SETTINGS_KEYWORD_CUSTOM_ID = "price-report:settings:keyword";
export const PRICE_REPORT_SETTINGS_KEYWORD_MODAL_CUSTOM_ID = "price-report:settings:keyword-modal";
export const PRICE_REPORT_SETTINGS_KEYWORD_INPUT_CUSTOM_IDS = [
  "price-report:settings:keyword-input",
  "price-report:settings:keyword-input:2",
  "price-report:settings:keyword-input:3",
  "price-report:settings:keyword-input:4",
  "price-report:settings:keyword-input:5",
] as const;
export const PRICE_REPORT_SETTINGS_PREVIEW_CUSTOM_ID = "price-report:settings:preview";
export const PRICE_REPORT_SETTINGS_WINDOW_CUSTOM_ID = "price-report:settings:window";
export const PRICE_REPORT_SETTINGS_CATEGORIES_CUSTOM_ID = "price-report:settings:categories";
export const PRICE_REPORT_SETTINGS_ALL_CATEGORIES_CUSTOM_ID =
  "price-report:settings:all-categories";
export const PRICE_REPORT_SETTINGS_CONTENT_FILTER_CUSTOM_ID = "price-report:settings:events";
export const PRICE_REPORT_SETTINGS_TIME_INPUT_CUSTOM_ID = "price-report:settings:time";
export const PRICE_REPORT_CONTENT_PRICE_DROPS_VALUE = "price_drops";
export const PRICE_REPORT_CONTENT_PRICE_RISES_VALUE = "price_rises";
export const PRICE_REPORT_CONTENT_NEW_PRODUCTS_VALUE = "new_products";
export const PRICE_REPORT_CATEGORY_OPTION_LIMIT = 25;

// 伺服器 public-report 設定面板、modal 與 select menu 使用的 component id。
export const PUBLIC_REPORT_SET_CHANNEL_CUSTOM_ID = "public-report:set-channel";
export const PUBLIC_REPORT_ENABLE_CUSTOM_ID = "public-report:enable";
export const PUBLIC_REPORT_DISABLE_CUSTOM_ID = "public-report:disable";
export const PUBLIC_REPORT_PREVIEW_CUSTOM_ID = "public-report:preview";
export const PUBLIC_REPORT_CLEAR_CUSTOM_ID = "public-report:clear";
export const PUBLIC_REPORT_CATEGORIES_CUSTOM_ID = "public-report:categories";
export const PUBLIC_REPORT_ALL_CATEGORIES_CUSTOM_ID = "public-report:all-categories";
export const PUBLIC_REPORT_CONTENT_FILTER_CUSTOM_ID = "public-report:events";
export const PUBLIC_REPORT_KEYWORD_CUSTOM_ID = "public-report:keyword";
export const PUBLIC_REPORT_KEYWORD_MODAL_CUSTOM_ID = "public-report:keyword-modal";
export const PUBLIC_REPORT_KEYWORD_INPUT_CUSTOM_IDS = [
  "public-report:keyword-input",
  "public-report:keyword-input:2",
  "public-report:keyword-input:3",
  "public-report:keyword-input:4",
  "public-report:keyword-input:5",
] as const;

// 目標價 watch 管理介面使用的 component id；prefix 型 id 會在後方附加 watch id 或列表狀態。
export const WATCH_CREATE_MODAL_CUSTOM_ID = "watch:create-modal";
export const WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX = "watch:edit-modal:";
export const WATCH_PRODUCT_CUSTOM_ID = "watch:product";
export const WATCH_TARGET_PRICE_CUSTOM_ID = "watch:target-price";
export const WATCH_ADD_CUSTOM_ID = "watch:add";
export const WATCH_SELECT_CUSTOM_ID_PREFIX = "watch:select:";
export const WATCH_EDIT_CUSTOM_ID_PREFIX = "watch:edit:";
export const WATCH_REMOVE_CUSTOM_ID_PREFIX = "watch:remove:";
export const WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX = "watch:remove-confirm:";
export const WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX = "watch:remove-cancel:";
export const WATCH_REFRESH_CUSTOM_ID_PREFIX = "watch:refresh:";
export const WATCH_PAGE_CUSTOM_ID_PREFIX = "watch:page:";
export const WATCH_FILTER_CUSTOM_ID_PREFIX = "watch:filter:";
export const WATCH_SORT_CUSTOM_ID_PREFIX = "watch:sort:";
export const WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX = "watch:bulk-remove:";
export const WATCH_BULK_REMOVE_SELECT_CUSTOM_ID_PREFIX = "watch:bulk-remove-select:";
export const WATCH_BULK_REMOVE_CONFIRM_CUSTOM_ID_PREFIX = "watch:bulk-remove-confirm:";
export const WATCH_BULK_REMOVE_CANCEL_CUSTOM_ID_PREFIX = "watch:bulk-remove-cancel:";
