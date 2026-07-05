// apps/crawler/src/scripts/ops/discord-bot/types/public-report.ts

export type ParsedPublicReportCommand =
  | {
      name: "status";
    }
  | {
      name: "manage";
    }
  | {
      name: "test";
    };

export type ParsedPublicReportComponent =
  | {
      name: "set_channel";
    }
  | {
      name: "enable";
    }
  | {
      name: "disable";
    }
  | {
      name: "preview";
    }
  | {
      name: "clear";
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
    }
  | {
      name: "open_keyword_modal";
    }
  | {
      name: "open_limit_modal";
    };

export type ParsedPublicReportModal =
  | {
      name: "limit";
      maxItems: number | null;
      maxItemsInputValid: boolean;
    }
  | {
      name: "keyword";
      productKeyword: string | null;
      productKeywordInputValid: boolean;
    };
