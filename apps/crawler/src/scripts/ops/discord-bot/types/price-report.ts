// apps/crawler/src/scripts/ops/discord-bot/types/price-report.ts
// 定義個人 price-report 指令、設定面板、modal 與發送結果使用的共用型別。

import type { DiscordDeliveryFailureMetadata } from "./discord-api";

// 個人價格報告 DM 發送結果，供即時預覽、手動 now 指令與排程流程共用。
export type PriceReportNowResult =
  | {
      status: "sent";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
    }
  | ({
      status: "rate_limited";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    } & DiscordDeliveryFailureMetadata)
  | ({
      status: "failed";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
    } & DiscordDeliveryFailureMetadata);

// 使用者設定每日私訊價格報告的台北時間。
export interface PriceReportTimeOfDay {
  hour: number;
  minute: number;
}

// `/price-report` slash command 解析後的內部 command。
export type ParsedPriceReportCommand =
  | {
      name: "now";
      windowHours: number | null;
      maxItems: number | null;
    }
  | {
      name: "settings";
    };

// 個人 price-report 設定面板的 button/select interaction 解析結果。
export type ParsedPriceReportComponent =
  | {
      name: "enable_daily_scheduled_report";
    }
  | {
      name: "disable_daily_scheduled_report";
    }
  | {
      name: "open_time_limit_modal";
    }
  | {
      name: "open_keyword_modal";
    }
  | {
      name: "preview_report";
    }
  | {
      name: "update_window";
      windowHours: number;
    }
  | {
      name: "update_categories";
      values: string[];
    }
  | {
      name: "update_all_categories";
    }
  | {
      name: "update_content_filters";
      includePriceDrops: boolean;
      includePriceRises: boolean;
      includeNewProducts: boolean;
    };

// 個人 price-report 設定 modal submit 的解析結果，保留輸入合法性供 handler 回覆錯誤。
export type ParsedPriceReportModal =
  | {
      name: "time_limit";
      maxItems: number | null;
      maxItemsInputValid: boolean;
      timeOfDay: PriceReportTimeOfDay | null;
      timeInputValid: boolean;
    }
  | {
      name: "keyword";
      productKeyword: string | null;
      productKeywordInputValid: boolean;
    };
