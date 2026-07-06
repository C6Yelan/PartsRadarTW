// apps/crawler/src/scripts/ops/discord-bot/commands/watch-parser.ts
// 解析目標價 watch 的 Discord component 與 modal submit，將 custom_id 與輸入值轉成內部 action。

import { MAX_TARGET_PRICE } from "../constants";
import type {
  DiscordInteraction,
  ParsedTargetPriceWatchComponent,
  ParsedTargetPriceWatchModal,
  TargetPriceWatchSortKey,
  TargetPriceWatchStatusFilter,
} from "../types";
import {
  WATCH_ADD_CUSTOM_ID,
  WATCH_BULK_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_BULK_REMOVE_SELECT_CUSTOM_ID_PREFIX,
  WATCH_CREATE_MODAL_CUSTOM_ID,
  WATCH_EDIT_CUSTOM_ID_PREFIX,
  WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX,
  WATCH_FILTER_CUSTOM_ID_PREFIX,
  WATCH_PAGE_CUSTOM_ID_PREFIX,
  WATCH_PRODUCT_CUSTOM_ID,
  WATCH_REFRESH_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_SELECT_CUSTOM_ID_PREFIX,
  WATCH_SORT_CUSTOM_ID_PREFIX,
  WATCH_TARGET_PRICE_CUSTOM_ID,
} from "./ids";
import { readSubmittedComponentValue } from "./submitted-components";

// 解析目標價 watch 訊息元件互動，保留列表頁碼、篩選與排序狀態供 handler 更新畫面。
export function parseTargetPriceWatchComponentInteraction(
  interaction: DiscordInteraction,
): ParsedTargetPriceWatchComponent | null {
  const customId = interaction.data?.custom_id;

  if (customId === WATCH_ADD_CUSTOM_ID) {
    return { action: "add" };
  }

  if (customId?.startsWith(WATCH_SELECT_CUSTOM_ID_PREFIX)) {
    const state = parseWatchListState(customId.slice(WATCH_SELECT_CUSTOM_ID_PREFIX.length));
    const selectedValue = interaction.data?.values?.[0];

    return {
      action: "select",
      targetPriceWatchInput:
        typeof selectedValue === "string" && selectedValue.trim() ? selectedValue.trim() : null,
      ...state,
    };
  }

  const edit = parseWatchActionCustomId(customId, WATCH_EDIT_CUSTOM_ID_PREFIX, true);

  if (edit) {
    return {
      action: "edit",
      targetPriceWatchInput: edit.targetPriceWatchInput,
      targetPrice: edit.targetPrice,
      page: edit.page,
      statusFilter: edit.statusFilter,
      sortKey: edit.sortKey,
    };
  }

  const remove = parseWatchActionCustomId(customId, WATCH_REMOVE_CUSTOM_ID_PREFIX);

  if (remove) {
    return {
      action: "remove",
      targetPriceWatchInput: remove.targetPriceWatchInput,
      page: remove.page,
      statusFilter: remove.statusFilter,
      sortKey: remove.sortKey,
    };
  }

  if (customId?.startsWith(WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX)) {
    return {
      action: "bulk_remove",
      ...parseWatchListState(customId.slice(WATCH_BULK_REMOVE_CUSTOM_ID_PREFIX.length)),
    };
  }

  if (customId?.startsWith(WATCH_BULK_REMOVE_SELECT_CUSTOM_ID_PREFIX)) {
    return {
      action: "bulk_remove_select",
      targetPriceWatchInputs: (interaction.data?.values ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
      ...parseWatchListState(customId.slice(WATCH_BULK_REMOVE_SELECT_CUSTOM_ID_PREFIX.length)),
    };
  }

  if (customId?.startsWith(WATCH_BULK_REMOVE_CONFIRM_CUSTOM_ID_PREFIX)) {
    return {
      action: "bulk_remove_confirm",
      token: parseWatchToken(customId.slice(WATCH_BULK_REMOVE_CONFIRM_CUSTOM_ID_PREFIX.length)),
    };
  }

  if (customId?.startsWith(WATCH_BULK_REMOVE_CANCEL_CUSTOM_ID_PREFIX)) {
    return {
      action: "bulk_remove_cancel",
      token: parseWatchToken(customId.slice(WATCH_BULK_REMOVE_CANCEL_CUSTOM_ID_PREFIX.length)),
    };
  }

  if (customId?.startsWith(WATCH_FILTER_CUSTOM_ID_PREFIX)) {
    const state = parseWatchListState(customId.slice(WATCH_FILTER_CUSTOM_ID_PREFIX.length));
    const selectedValue = interaction.data?.values?.[0];

    return {
      action: "filter",
      page: 0,
      statusFilter: parseWatchStatusFilter(selectedValue) ?? state.statusFilter,
      sortKey: state.sortKey,
    };
  }

  if (customId?.startsWith(WATCH_SORT_CUSTOM_ID_PREFIX)) {
    const state = parseWatchListState(customId.slice(WATCH_SORT_CUSTOM_ID_PREFIX.length));
    const selectedValue = interaction.data?.values?.[0];

    return {
      action: "sort",
      page: 0,
      statusFilter: state.statusFilter,
      sortKey: parseWatchSortKey(selectedValue) ?? state.sortKey,
    };
  }

  const confirmRemove = parseWatchActionCustomId(customId, WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX);

  if (confirmRemove) {
    return {
      action: "confirm_remove",
      targetPriceWatchInput: confirmRemove.targetPriceWatchInput,
      page: confirmRemove.page,
      statusFilter: confirmRemove.statusFilter,
      sortKey: confirmRemove.sortKey,
    };
  }

  const cancelRemove = parseWatchActionCustomId(customId, WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX);

  if (cancelRemove) {
    return {
      action: "cancel_remove",
      targetPriceWatchInput: cancelRemove.targetPriceWatchInput,
      page: cancelRemove.page,
      statusFilter: cancelRemove.statusFilter,
      sortKey: cancelRemove.sortKey,
    };
  }

  if (customId?.startsWith(WATCH_REFRESH_CUSTOM_ID_PREFIX)) {
    return {
      action: "refresh",
      ...parseWatchListState(customId.slice(WATCH_REFRESH_CUSTOM_ID_PREFIX.length)),
    };
  }

  if (customId?.startsWith(WATCH_PAGE_CUSTOM_ID_PREFIX)) {
    return {
      action: "page",
      ...parseWatchListState(customId.slice(WATCH_PAGE_CUSTOM_ID_PREFIX.length)),
    };
  }

  return null;
}

// 解析新增與編輯 watch 的 modal submit，先做基本輸入驗證再交給後續 handler 執行寫入。
export function parseTargetPriceWatchModalSubmit(
  interaction: DiscordInteraction,
): ParsedTargetPriceWatchModal | null {
  const customId = interaction.data?.custom_id;
  const targetPriceValue = readSubmittedComponentValue(
    interaction.data?.components,
    WATCH_TARGET_PRICE_CUSTOM_ID,
  );
  const targetPrice = parseTargetPriceInput(targetPriceValue);

  if (customId === WATCH_CREATE_MODAL_CUSTOM_ID) {
    const productValue = readSubmittedComponentValue(
      interaction.data?.components,
      WATCH_PRODUCT_CUSTOM_ID,
    );
    const productInput = typeof productValue === "string" ? productValue.trim() : "";

    return {
      action: "create",
      productInput: productInput.length > 0 ? productInput : null,
      productInputValid: productInput.length > 0,
      targetPrice,
      targetPriceInputValid: targetPrice !== null,
    };
  }

  if (customId?.startsWith(WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX)) {
    const [watchId, pageValue, filterValue, sortValue] = customId
      .slice(WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX.length)
      .split(":");

    return {
      action: "edit",
      targetPriceWatchInput: watchId ? `watch:${watchId}` : null,
      page: parsePage(pageValue),
      statusFilter: parseWatchStatusFilter(filterValue) ?? "all",
      sortKey: parseWatchSortKey(sortValue) ?? "recent",
      targetPrice,
      targetPriceInputValid: targetPrice !== null,
    };
  }

  return null;
}

// 解析帶有 watch id 與列表狀態的 action custom_id，供 edit/remove/confirm/cancel 共用。
function parseWatchActionCustomId(
  customId: string | undefined,
  prefix: string,
  includesTargetPrice = false,
): {
  targetPriceWatchInput: string | null;
  targetPrice: number | null;
  page: number;
  statusFilter: TargetPriceWatchStatusFilter;
  sortKey: TargetPriceWatchSortKey;
} | null {
  if (!customId?.startsWith(prefix)) {
    return null;
  }

  const segments = customId.slice(prefix.length).split(":");
  const watchId = segments[0]?.trim();
  const targetPrice = includesTargetPrice ? parseTargetPriceInput(segments[1]) : null;
  const state = parseWatchListState(segments.slice(includesTargetPrice ? 2 : 1).join(":"));

  return {
    targetPriceWatchInput: watchId ? `watch:${watchId}` : null,
    targetPrice,
    ...state,
  };
}

// 解析 watch 管理清單的頁碼、狀態篩選與排序；缺值或非法值一律回到安全預設。
function parseWatchListState(value: string | undefined): {
  page: number;
  statusFilter: TargetPriceWatchStatusFilter;
  sortKey: TargetPriceWatchSortKey;
} {
  const [pageValue, filterValue, sortValue] = typeof value === "string" ? value.split(":") : [];

  return {
    page: parsePage(pageValue),
    statusFilter: parseWatchStatusFilter(filterValue) ?? "all",
    sortKey: parseWatchSortKey(sortValue) ?? "recent",
  };
}

// 將 Discord select 的狀態值收斂成 watch 清單支援的篩選 enum。
function parseWatchStatusFilter(value: unknown): TargetPriceWatchStatusFilter | null {
  return value === "all" || value === "reached" || value === "unreached" ? value : null;
}

// 將 Discord select 的排序值收斂成 watch 清單支援的排序 enum。
function parseWatchSortKey(value: unknown): TargetPriceWatchSortKey | null {
  return value === "recent" || value === "target" || value === "current" ? value : null;
}

// 驗證批次刪除確認 token 的基本格式，避免接受明顯錯誤的 custom_id payload。
function parseWatchToken(value: string | undefined): string | null {
  const token = value?.trim() ?? "";

  return /^[0-9a-f-]{36}$/i.test(token) ? token : null;
}

// 解析列表頁碼；任何非法值都回到第一頁，避免互動狀態破壞清單導覽。
function parsePage(value: unknown): number {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    return 0;
  }

  const page = Number(value);

  return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

// 驗證目標價輸入必須是允許範圍內的新台幣整數，避免不合法金額進入 watch 寫入流程。
function parseTargetPriceInput(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.trim())) {
    return null;
  }

  const targetPrice = Number(value.trim());

  return Number.isSafeInteger(targetPrice) && targetPrice >= 1 && targetPrice <= MAX_TARGET_PRICE
    ? targetPrice
    : null;
}
