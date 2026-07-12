// apps/web/app/build-list/storage.ts
// 封裝配單 v3 intent 的 localStorage 讀寫、資料正規化與同頁同步事件。

import { type BuildListIntent, normalizeBuildListIntents } from "./model";

export const BUILD_LIST_STORAGE_KEY = "partsradartw:build-list:v3";
export const BUILD_LIST_UPDATED_EVENT = "partsradartw:build-list-updated";

// 配單 storage 的最小介面，讓測試可注入 fake storage，不直接依賴瀏覽器物件。
export interface BuildListStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

// 讀取並正規化 persisted 配單資料；storage 不可用或 JSON 壞掉時回傳空配單。
export function readBuildListIntents(storage = getBrowserStorage()): BuildListIntent[] {
  if (!storage) {
    return [];
  }

  try {
    const rawValue = storage.getItem(BUILD_LIST_STORAGE_KEY);

    return rawValue ? normalizeBuildListIntents(JSON.parse(rawValue)) : [];
  } catch {
    return [];
  }
}

// 寫入正規化後的配單資料；空配單直接移除 storage key。
export function writeBuildListIntents(
  intents: BuildListIntent[],
  storage = getBrowserStorage(),
): BuildListIntent[] {
  const normalizedIntents = normalizeBuildListIntents(intents);

  if (!storage) {
    return normalizedIntents;
  }

  if (normalizedIntents.length === 0) {
    storage.removeItem(BUILD_LIST_STORAGE_KEY);
  } else {
    storage.setItem(BUILD_LIST_STORAGE_KEY, JSON.stringify(normalizedIntents));
  }

  return normalizedIntents;
}

// 通知同一頁面內其他 hook 重新讀取配單；跨分頁同步由 browser storage event 負責。
export function dispatchBuildListUpdated() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(BUILD_LIST_UPDATED_EVENT));
}

// 取得瀏覽器 localStorage；SSR 或非瀏覽器環境回傳 null。
function getBrowserStorage(): BuildListStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}
