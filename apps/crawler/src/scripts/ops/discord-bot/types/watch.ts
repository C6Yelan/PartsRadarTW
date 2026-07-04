// apps/crawler/src/scripts/ops/discord-bot/types/watch.ts

export type TargetPriceWatchStatusFilter = "all" | "reached" | "unreached";
export type TargetPriceWatchSortKey = "recent" | "target" | "current";

export type ParsedWatchModal =
  | {
      action: "create";
      productInput: string | null;
      productInputValid: boolean;
      targetPrice: number | null;
      targetPriceInputValid: boolean;
    }
  | {
      action: "edit";
      watchInput: string | null;
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
      targetPrice: number | null;
      targetPriceInputValid: boolean;
    };

export type ParsedWatchComponent =
  | { action: "add" }
  | {
      action: "select";
      watchInput: string | null;
      page: number;
      statusFilter: TargetPriceWatchStatusFilter;
      sortKey: TargetPriceWatchSortKey;
    }
  | {
      action: "edit";
      watchInput: string | null;
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
      watchInputs: string[];
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
      watchInput: string | null;
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
