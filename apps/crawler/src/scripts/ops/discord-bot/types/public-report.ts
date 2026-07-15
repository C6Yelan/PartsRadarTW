// apps/crawler/src/scripts/ops/discord-bot/types/public-report.ts
// 定義 public-report slash command、設定面板 component 與 modal submit 的解析結果型別。

// `/public-report` slash command 解析後的維運子命令。
export type ParsedPublicReportCommand = { name: "settings" };

// public-report 管理面板的 button/select interaction 解析結果。
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
    };

// public-report 設定 modal submit 的解析結果，保留輸入合法性供 handler 回覆錯誤。
export type ParsedPublicReportModal = {
  name: "keyword";
  productKeyword: string | null;
  productKeywordInputValid: boolean;
};
