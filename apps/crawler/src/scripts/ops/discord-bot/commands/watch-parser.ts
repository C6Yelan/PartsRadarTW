// apps/crawler/src/scripts/ops/discord-bot/commands/watch-parser.ts
// 解析目標價 watch 的 Discord component 與 modal submit，將 custom_id 與輸入值轉成內部 action。

import { MAX_TARGET_PRICE } from "../constants";
import type {
  DiscordInteraction,
  ParsedTargetPriceWatchComponent,
  ParsedTargetPriceWatchModal,
} from "../types";
import { WATCH_MANAGER_MAX_PAGE } from "../watch/list-limits";
import {
  WATCH_ADD_CUSTOM_ID,
  WATCH_CREATE_MODAL_CUSTOM_ID,
  WATCH_EDIT_CUSTOM_ID_PREFIX,
  WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX,
  WATCH_PAGE_CUSTOM_ID_PREFIX,
  WATCH_PRODUCT_CUSTOM_ID,
  WATCH_REFRESH_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX,
  WATCH_REMOVE_CUSTOM_ID_PREFIX,
  WATCH_SELECT_CUSTOM_ID_PREFIX,
  WATCH_TARGET_PRICE_CUSTOM_ID,
} from "./ids";
import { readSubmittedComponentValue } from "./submitted-components";

// 解析目標價 watch 訊息元件互動，保留列表頁碼供 handler 更新畫面。
export function parseTargetPriceWatchComponentInteraction(
  interaction: DiscordInteraction,
): ParsedTargetPriceWatchComponent | null {
  const customId = interaction.data?.custom_id;

  if (customId === WATCH_ADD_CUSTOM_ID) {
    return { action: "add" };
  }

  if (customId?.startsWith(WATCH_SELECT_CUSTOM_ID_PREFIX)) {
    const selectedValue = interaction.data?.values?.[0];

    return {
      action: "select",
      targetPriceWatchInput:
        typeof selectedValue === "string" && selectedValue.trim() ? selectedValue.trim() : null,
      page: parsePage(customId.slice(WATCH_SELECT_CUSTOM_ID_PREFIX.length)),
    };
  }

  const edit = parseWatchActionCustomId(customId, WATCH_EDIT_CUSTOM_ID_PREFIX, true);

  if (edit) {
    return {
      action: "edit",
      targetPriceWatchInput: edit.targetPriceWatchInput,
      targetPrice: edit.targetPrice,
      page: edit.page,
    };
  }

  const remove = parseWatchActionCustomId(customId, WATCH_REMOVE_CUSTOM_ID_PREFIX);

  if (remove) {
    return {
      action: "remove",
      targetPriceWatchInput: remove.targetPriceWatchInput,
      page: remove.page,
    };
  }

  const confirmRemove = parseWatchActionCustomId(customId, WATCH_REMOVE_CONFIRM_CUSTOM_ID_PREFIX);

  if (confirmRemove) {
    return {
      action: "confirm_remove",
      targetPriceWatchInput: confirmRemove.targetPriceWatchInput,
      page: confirmRemove.page,
    };
  }

  const cancelRemove = parseWatchActionCustomId(customId, WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX);

  if (cancelRemove) {
    return {
      action: "cancel_remove",
      targetPriceWatchInput: cancelRemove.targetPriceWatchInput,
      page: cancelRemove.page,
    };
  }

  if (customId?.startsWith(WATCH_REFRESH_CUSTOM_ID_PREFIX)) {
    return {
      action: "refresh",
      page: parsePage(customId.slice(WATCH_REFRESH_CUSTOM_ID_PREFIX.length)),
    };
  }

  if (customId?.startsWith(WATCH_PAGE_CUSTOM_ID_PREFIX)) {
    return {
      action: "page",
      page: parsePage(customId.slice(WATCH_PAGE_CUSTOM_ID_PREFIX.length)),
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
    const [watchId, pageValue] = customId
      .slice(WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX.length)
      .split(":");

    return {
      action: "edit",
      targetPriceWatchInput: watchId ? `watch:${watchId}` : null,
      page: parsePage(pageValue),
      targetPrice,
      targetPriceInputValid: targetPrice !== null,
    };
  }

  return null;
}

// 解析帶有 watch id 與頁碼的 action custom_id，供 edit/remove/confirm/cancel 共用。
function parseWatchActionCustomId(
  customId: string | undefined,
  prefix: string,
  includesTargetPrice = false,
): {
  targetPriceWatchInput: string | null;
  targetPrice: number | null;
  page: number;
} | null {
  if (!customId?.startsWith(prefix)) {
    return null;
  }

  const segments = customId.slice(prefix.length).split(":");
  const watchId = segments[0]?.trim();
  const targetPrice = includesTargetPrice ? parseTargetPriceInput(segments[1]) : null;
  const page = parsePage(segments[includesTargetPrice ? 2 : 1]);

  return {
    targetPriceWatchInput: watchId ? `watch:${watchId}` : null,
    targetPrice,
    page,
  };
}

// 解析列表頁碼；存活中的舊訊息若仍帶有 filter/sort 尾碼，只讀取第一段頁碼。
function parsePage(value: unknown): number {
  const pageValue = typeof value === "string" ? value.split(":")[0] : null;

  if (!pageValue || !/^[0-9]+$/.test(pageValue)) {
    return 0;
  }

  const normalizedPageValue = pageValue.replace(/^0+(?=[0-9])/, "");
  const maxPageDigits = WATCH_MANAGER_MAX_PAGE.toString().length;

  if (normalizedPageValue.length > maxPageDigits) {
    return WATCH_MANAGER_MAX_PAGE;
  }

  const page = Number(normalizedPageValue);

  return Number.isSafeInteger(page) && page >= 0
    ? Math.min(page, WATCH_MANAGER_MAX_PAGE)
    : WATCH_MANAGER_MAX_PAGE;
}

// 驗證目標價輸入必須是允許範圍內的新台幣整數，避免不合法金額進入 watch 寫入流程。
function parseTargetPriceInput(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - "０".charCodeAt(0)));

  if (!/^(0|[1-9][0-9]*)$/.test(normalized)) {
    return null;
  }

  const targetPrice = Number(normalized);

  return Number.isSafeInteger(targetPrice) && targetPrice >= 1 && targetPrice <= MAX_TARGET_PRICE
    ? targetPrice
    : null;
}
