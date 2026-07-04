// apps/crawler/src/scripts/ops/discord-bot/commands/watch-parser.ts

import { MAX_TARGET_PRICE } from "../constants";
import type {
  DiscordInteraction,
  ParsedWatchComponent,
  ParsedWatchModal,
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

export function parseWatchComponentInteraction(
  interaction: DiscordInteraction,
): ParsedWatchComponent | null {
  const customId = interaction.data?.custom_id;

  if (customId === WATCH_ADD_CUSTOM_ID) {
    return { action: "add" };
  }

  if (customId?.startsWith(WATCH_SELECT_CUSTOM_ID_PREFIX)) {
    const state = parseWatchListState(customId.slice(WATCH_SELECT_CUSTOM_ID_PREFIX.length));
    const selectedValue = interaction.data?.values?.[0];

    return {
      action: "select",
      watchInput:
        typeof selectedValue === "string" && selectedValue.trim() ? selectedValue.trim() : null,
      ...state,
    };
  }

  const edit = parseWatchActionCustomId(customId, WATCH_EDIT_CUSTOM_ID_PREFIX, true);

  if (edit) {
    return {
      action: "edit",
      watchInput: edit.watchInput,
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
      watchInput: remove.watchInput,
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
      watchInputs: (interaction.data?.values ?? [])
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
      watchInput: confirmRemove.watchInput,
      page: confirmRemove.page,
      statusFilter: confirmRemove.statusFilter,
      sortKey: confirmRemove.sortKey,
    };
  }

  const cancelRemove = parseWatchActionCustomId(customId, WATCH_REMOVE_CANCEL_CUSTOM_ID_PREFIX);

  if (cancelRemove) {
    return {
      action: "cancel_remove",
      watchInput: cancelRemove.watchInput,
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

export function parseWatchModalSubmit(interaction: DiscordInteraction): ParsedWatchModal | null {
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
      watchInput: watchId ? `watch:${watchId}` : null,
      page: parsePage(pageValue),
      statusFilter: parseWatchStatusFilter(filterValue) ?? "all",
      sortKey: parseWatchSortKey(sortValue) ?? "recent",
      targetPrice,
      targetPriceInputValid: targetPrice !== null,
    };
  }

  return null;
}

function parseWatchActionCustomId(
  customId: string | undefined,
  prefix: string,
  includesTargetPrice = false,
): {
  watchInput: string | null;
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
    watchInput: watchId ? `watch:${watchId}` : null,
    targetPrice,
    ...state,
  };
}

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

function parseWatchStatusFilter(value: unknown): TargetPriceWatchStatusFilter | null {
  return value === "all" || value === "reached" || value === "unreached" ? value : null;
}

function parseWatchSortKey(value: unknown): TargetPriceWatchSortKey | null {
  return value === "recent" || value === "target" || value === "current" ? value : null;
}

function parseWatchToken(value: string | undefined): string | null {
  const token = value?.trim() ?? "";

  return /^[0-9a-f-]{36}$/i.test(token) ? token : null;
}

function parsePage(value: unknown): number {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    return 0;
  }

  const page = Number(value);

  return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

function parseTargetPriceInput(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.trim())) {
    return null;
  }

  const targetPrice = Number(value.trim());

  return Number.isSafeInteger(targetPrice) && targetPrice >= 1 && targetPrice <= MAX_TARGET_PRICE
    ? targetPrice
    : null;
}
