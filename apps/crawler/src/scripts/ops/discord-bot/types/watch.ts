// apps/crawler/src/scripts/ops/discord-bot/types/watch.ts
// 定義目標價 watch 管理介面的 component action 與 modal submit 解析結果。

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
      targetPrice: number | null;
      targetPriceInputValid: boolean;
    };

// 目標價 watch 管理面板的 button/select interaction 解析結果，只保留必要的列表頁碼。
export type ParsedTargetPriceWatchComponent =
  | { action: "add" }
  | {
      action: "select";
      targetPriceWatchInput: string | null;
      page: number;
    }
  | {
      action: "edit";
      targetPriceWatchInput: string | null;
      targetPrice: number | null;
      page: number;
    }
  | {
      action: "remove" | "confirm_remove" | "cancel_remove";
      targetPriceWatchInput: string | null;
      page: number;
    }
  | {
      action: "refresh" | "page";
      page: number;
    };
