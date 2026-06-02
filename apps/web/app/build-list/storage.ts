// apps/web/app/build-list/storage.ts
import { normalizeBuildListItems, type BuildListItem } from "./model";

export const BUILD_LIST_STORAGE_KEY = "partsradartw:build-list:v1";
export const BUILD_LIST_UPDATED_EVENT = "partsradartw:build-list-updated";

export interface BuildListStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export function readBuildListItems(storage = getBrowserStorage()): BuildListItem[] {
  if (!storage) {
    return [];
  }

  try {
    const rawValue = storage.getItem(BUILD_LIST_STORAGE_KEY);

    return rawValue ? normalizeBuildListItems(JSON.parse(rawValue)) : [];
  } catch {
    return [];
  }
}

export function writeBuildListItems(
  items: BuildListItem[],
  storage = getBrowserStorage(),
): BuildListItem[] {
  const normalizedItems = normalizeBuildListItems(items);

  if (!storage) {
    return normalizedItems;
  }

  if (normalizedItems.length === 0) {
    storage.removeItem(BUILD_LIST_STORAGE_KEY);
  } else {
    storage.setItem(BUILD_LIST_STORAGE_KEY, JSON.stringify(normalizedItems));
  }

  return normalizedItems;
}

export function dispatchBuildListUpdated() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(BUILD_LIST_UPDATED_EVENT));
}

function getBrowserStorage(): BuildListStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}
