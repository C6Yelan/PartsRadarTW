// apps/crawler/src/scripts/ops/discord-bot/types/price-report.ts

export type PriceReportNowResult =
  | {
      status: "sent";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
    }
  | {
      status: "rate_limited";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

export interface PriceReportTimeOfDay {
  hour: number;
  minute: number;
}

export type ParsedPriceReportCommand =
  | {
      name: "now";
      windowHours: number | null;
      maxItems: number | null;
    }
  | {
      name: "settings";
    };

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
