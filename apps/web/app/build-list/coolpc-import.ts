// apps/web/app/build-list/coolpc-import.ts
import type { BuildListItem } from "./model";

export const COOLPC_IMPORT_USER_SCRIPT_PATH = "/tools/coolpc-import.user.js";
export const COOLPC_IMPORT_INSTALL_PATH = "/tools/coolpc-import";
export const COOLPC_ESTIMATE_IMPORT_BASE_URL = "https://www.coolpc.com.tw/evaluate.php/";
export const COOLPC_ESTIMATE_IMPORT_HASH_PREFIX = "partsradar=";
export const COOLPC_ESTIMATE_MAX_QUANTITY = 10;

export interface CoolpcEstimateImportPayloadItem {
  g: number;
  t: string;
  q: number;
  p: number;
}

export interface CoolpcEstimateImportPayload {
  source: "partsradar";
  v: 1;
  createdAt: string;
  items: CoolpcEstimateImportPayloadItem[];
}

export interface CoolpcEstimateImportPlan {
  canImport: boolean;
  importUrl: string | null;
  payload: CoolpcEstimateImportPayload;
  importedItemCount: number;
  duplicateCategoryItems: BuildListItem[];
  quantityClippedItems: BuildListItem[];
  unsupportedItems: BuildListItem[];
}

export function createCoolpcEstimateImportPlan(
  items: BuildListItem[],
  now = new Date(),
): CoolpcEstimateImportPlan {
  const payloadItems: CoolpcEstimateImportPayloadItem[] = [];
  const duplicateCategoryItems: BuildListItem[] = [];
  const quantityClippedItems: BuildListItem[] = [];
  const unsupportedItems: BuildListItem[] = [];
  const seenIgrps = new Set<number>();

  for (const item of items) {
    const ibuyToken = extractCoolpcIbuyToken(item.source.url);

    if (!ibuyToken) {
      unsupportedItems.push(item);
      continue;
    }

    if (seenIgrps.has(item.category.igrp)) {
      duplicateCategoryItems.push(item);
      continue;
    }

    seenIgrps.add(item.category.igrp);

    const quantity = Math.min(item.quantity, COOLPC_ESTIMATE_MAX_QUANTITY);

    if (quantity !== item.quantity) {
      quantityClippedItems.push(item);
    }

    payloadItems.push({
      g: item.category.igrp,
      t: ibuyToken,
      q: quantity,
      p: item.price.amount,
    });
  }

  const payload: CoolpcEstimateImportPayload = {
    source: "partsradar",
    v: 1,
    createdAt: now.toISOString(),
    items: payloadItems,
  };

  return {
    canImport: payloadItems.length > 0,
    importUrl: payloadItems.length > 0 ? createCoolpcEstimateImportUrl(payload) : null,
    payload,
    importedItemCount: payloadItems.length,
    duplicateCategoryItems,
    quantityClippedItems,
    unsupportedItems,
  };
}

export function createCoolpcEstimateImportUrl(payload: CoolpcEstimateImportPayload) {
  const url = new URL(COOLPC_ESTIMATE_IMPORT_BASE_URL);
  url.hash = `${COOLPC_ESTIMATE_IMPORT_HASH_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;

  return url.toString();
}

export function extractCoolpcIbuyToken(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);

    if (url.hostname !== "www.coolpc.com.tw") {
      return null;
    }

    const token = url.searchParams.get("iBuy")?.trim();

    return token ? token : null;
  } catch {
    return null;
  }
}
