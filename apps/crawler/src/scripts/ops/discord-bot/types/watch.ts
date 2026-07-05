// apps/crawler/src/scripts/ops/discord-bot/types/watch.ts

export type TargetPriceWatchStatusFilter = "all" | "reached" | "unreached";
export type TargetPriceWatchSortKey = "recent" | "target" | "current";

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
