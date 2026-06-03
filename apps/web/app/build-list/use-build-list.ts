"use client";
// apps/web/app/build-list/use-build-list.ts

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addProductToBuildList,
  removeBuildListItem,
  restoreBuildListItem,
  summarizeBuildList,
  type BuildListItem,
  type BuildListProduct,
  updateBuildListItemQuantity,
} from "./model";
import {
  BUILD_LIST_STORAGE_KEY,
  BUILD_LIST_UPDATED_EVENT,
  dispatchBuildListUpdated,
  readBuildListItems,
  writeBuildListItems,
} from "./storage";

export function useBuildList() {
  const [items, setItems] = useState<BuildListItem[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    function syncFromStorage() {
      setItems(readBuildListItems());
      setIsReady(true);
    }

    function syncFromStorageEvent(event: StorageEvent) {
      if (event.key === BUILD_LIST_STORAGE_KEY) {
        syncFromStorage();
      }
    }

    syncFromStorage();
    window.addEventListener(BUILD_LIST_UPDATED_EVENT, syncFromStorage);
    window.addEventListener("storage", syncFromStorageEvent);

    return () => {
      window.removeEventListener(BUILD_LIST_UPDATED_EVENT, syncFromStorage);
      window.removeEventListener("storage", syncFromStorageEvent);
    };
  }, []);

  const commitItems = useCallback((updater: (currentItems: BuildListItem[]) => BuildListItem[]) => {
    const nextItems = writeBuildListItems(updater(readBuildListItems()));
    setItems(nextItems);
    setIsReady(true);
    dispatchBuildListUpdated();
  }, []);

  const addProduct = useCallback(
    (product: BuildListProduct) => {
      commitItems((currentItems) => addProductToBuildList(currentItems, product));
    },
    [commitItems],
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      commitItems((currentItems) => updateBuildListItemQuantity(currentItems, productId, quantity));
    },
    [commitItems],
  );

  const removeItem = useCallback(
    (productId: string) => {
      commitItems((currentItems) => removeBuildListItem(currentItems, productId));
    },
    [commitItems],
  );

  const restoreItem = useCallback(
    (item: BuildListItem) => {
      commitItems((currentItems) => restoreBuildListItem(currentItems, item));
    },
    [commitItems],
  );

  const clearItems = useCallback(() => {
    commitItems(() => []);
  }, [commitItems]);

  const quantityByProductId = useMemo(
    () => new Map(items.map((item) => [item.id, item.quantity])),
    [items],
  );
  const summary = useMemo(() => summarizeBuildList(items), [items]);

  return {
    items,
    isReady,
    quantityByProductId,
    summary,
    addProduct,
    updateQuantity,
    removeItem,
    restoreItem,
    clearItems,
  };
}
