"use client";
// apps/web/app/build-list/use-build-list.ts
// 管理只含使用者意圖的配單 localStorage，並同步同頁 hook 與其他分頁。

import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_BUILD_LIST_PRODUCTS } from "./constants";
import {
  addProductToBuildList,
  type BuildListIntent,
  removeBuildListItem as removeBuildListItemFromCollection,
  restoreBuildListItem as restoreBuildListItemToCollection,
  summarizeBuildListIntents,
  updateBuildListItemQuantity as updateBuildListItemQuantityInCollection,
} from "./model";
import {
  BUILD_LIST_STORAGE_KEY,
  BUILD_LIST_UPDATED_EVENT,
  dispatchBuildListUpdated,
  readBuildListIntents,
  writeBuildListIntents,
} from "./storage";

export function useBuildList() {
  const [intents, setIntents] = useState<BuildListIntent[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    function syncFromStorage() {
      setIntents(readBuildListIntents());
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

  const commitIntents = useCallback(
    (updater: (currentIntents: BuildListIntent[]) => BuildListIntent[]) => {
      const nextIntents = writeBuildListIntents(updater(readBuildListIntents()));
      setIntents(nextIntents);
      setIsReady(true);
      dispatchBuildListUpdated();
    },
    [],
  );

  const addBuildListProduct = useCallback(
    (productId: string) => {
      commitIntents((currentIntents) => addProductToBuildList(currentIntents, productId));
    },
    [commitIntents],
  );

  const setBuildListItemQuantity = useCallback(
    (productId: string, quantity: number) => {
      commitIntents((currentIntents) =>
        updateBuildListItemQuantityInCollection(currentIntents, productId, quantity),
      );
    },
    [commitIntents],
  );

  const removeBuildListItem = useCallback(
    (productId: string) => {
      commitIntents((currentIntents) =>
        removeBuildListItemFromCollection(currentIntents, productId),
      );
    },
    [commitIntents],
  );

  const restoreBuildListItem = useCallback(
    (intent: BuildListIntent) => {
      commitIntents((currentIntents) => restoreBuildListItemToCollection(currentIntents, intent));
    },
    [commitIntents],
  );

  const clearBuildListItems = useCallback(() => {
    commitIntents(() => []);
  }, [commitIntents]);

  const quantityByProductId = useMemo(
    () => new Map(intents.map((intent) => [intent.productId, intent.quantity])),
    [intents],
  );
  const summary = useMemo(() => summarizeBuildListIntents(intents), [intents]);

  return {
    intents,
    isReady,
    isProductLimitReached: intents.length >= MAX_BUILD_LIST_PRODUCTS,
    quantityByProductId,
    summary,
    addBuildListProduct,
    setBuildListItemQuantity,
    removeBuildListItem,
    restoreBuildListItem,
    clearBuildListItems,
  };
}
