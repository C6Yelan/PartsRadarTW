// apps/crawler/src/scripts/ops/discord-bot/types/watch.ts
// 定義目標價 watch 管理介面的列表狀態、component action 與 modal submit 解析結果。

// watch 管理列表支援的達標狀態篩選。
export type TargetPriceWatchStatusFilter = "all" | "reached" | "unreached";

// watch 管理列表支援的排序方式。
export type TargetPriceWatchSortKey = "recent" | "target" | "current";

// 新增與編輯目標價 watch modal submit 的解析結果，保留輸入合法性供 handler 回覆錯誤。
export type ParsedTargetPriceWatchModal =
  | {
      action: "create";
      productInput: string | null;
      productInputValid: boolean;
      targetPrice: number | null;
      targetPriceInputValid: boolean;
    }
  | {
      action: "edit";
      targetPriceWatchInput: string | null;
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
      targetPrice: number | null;
      targetPriceInputValid: boolean;
    };

// 目標價 watch 管理面板的 button/select interaction 解析結果，包含列表頁碼與篩選狀態。
export type ParsedTargetPriceWatchComponent =
  | { action: "add" }
  | {
      action: "select";
      targetPriceWatchInput: string | null;
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    }
  | {
      action: "edit";
      targetPriceWatchInput: string | null;
      targetPrice: number | null;
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    }
  | {
      action: "bulk_remove";
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    }
  | {
      action: "bulk_remove_select";
      targetPriceWatchInputs: string[];
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    }
  | {
      action: "bulk_remove_confirm" | "bulk_remove_cancel";
      token: string | null;
    }
  | {
      action: "filter" | "sort";
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    }
  | {
      action: "remove" | "confirm_remove" | "cancel_remove";
      targetPriceWatchInput: string | null;
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    }
  | {
      action: "refresh" | "page";
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    };
