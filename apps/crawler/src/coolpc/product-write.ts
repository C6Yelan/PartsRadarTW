// apps/crawler/src/coolpc/product-write.ts
// 管理單一 CoolPC 分類觀測結果的持久化流程：先寫入本次看到的商品，再更新缺漏狀態並回傳摘要。

import type { ParsedCoolpcProduct } from "./parser";
import { writeObservedProduct } from "./product-write/item-writer";
import { markMissingProducts } from "./product-write/missing-products";
import type {
  CoolpcProductWriteDelegates,
  WriteCoolpcCategoryProductObservationOptions,
  WriteCoolpcCategoryProductObservationResult,
} from "./product-write/types";

export type {
  CoolpcProductWriteClient,
  WriteCoolpcCategoryProductObservationOptions,
  WriteCoolpcCategoryProductObservationResult,
} from "./product-write/types";

// 在一個 transaction 內完成一個分類頁的商品觀測落地，確保 product、current_price、price_snapshot 同步一致。
export async function writeCoolpcCategoryProductObservation({
  client,
  crawlRunId,
  rawSnapshotId = null,
  sourceCategoryId,
  fetchedAt,
  parsedProducts,
  excludedIbuyTokens = [],
}: WriteCoolpcCategoryProductObservationOptions): Promise<WriteCoolpcCategoryProductObservationResult> {
  // 商品資料、價格快照、現用價格需一起更新，交易邊界放在這裡統一處理，避免各呼叫端自行拼出不一致規則。
  return client.$transaction((transactionClient) =>
    writeCoolpcCategoryProductObservationInTransaction({
      client: transactionClient,
      crawlRunId,
      rawSnapshotId,
      sourceCategoryId,
      fetchedAt,
      parsedProducts,
      excludedIbuyTokens,
    }),
  );
}

async function writeCoolpcCategoryProductObservationInTransaction({
  client,
  crawlRunId,
  rawSnapshotId,
  sourceCategoryId,
  fetchedAt,
  parsedProducts,
  excludedIbuyTokens,
}: Omit<WriteCoolpcCategoryProductObservationOptions, "client" | "rawSnapshotId"> & {
  client: CoolpcProductWriteDelegates;
  rawSnapshotId: string | null;
}): Promise<WriteCoolpcCategoryProductObservationResult> {
  const result: WriteCoolpcCategoryProductObservationResult = {
    processedItemCount: parsedProducts.length,
    createdProductCount: 0,
    createdProductIds: [],
    updatedProductCount: 0,
    priceSnapshotCreatedCount: 0,
    priceUnchangedCount: 0,
    missingProductUpdatedCount: 0,
    markedInactiveProductCount: 0,
  };
  const presentIbuyTokens = new Set<string>();

  for (const parsedProduct of parsedProducts) {
    assertParsedProductBelongsToCategory(parsedProduct, sourceCategoryId);
    presentIbuyTokens.add(parsedProduct.ibuyToken);

    const observedProductResult = await writeObservedProduct({
      client,
      crawlRunId,
      rawSnapshotId,
      parsedProduct,
    });

    result.createdProductCount += observedProductResult.createdProductCount;
    result.createdProductIds.push(...observedProductResult.createdProductIds);
    result.updatedProductCount += observedProductResult.updatedProductCount;
    result.priceSnapshotCreatedCount += observedProductResult.priceSnapshotCreatedCount;
    result.priceUnchangedCount += observedProductResult.priceUnchangedCount;
  }

  const missingResult = await markMissingProducts({
    client,
    sourceCategoryId,
    fetchedAt,
    presentIbuyTokens,
    excludedIbuyTokens: new Set(excludedIbuyTokens),
  });
  result.missingProductUpdatedCount = missingResult.missingProductUpdatedCount;
  result.markedInactiveProductCount = missingResult.markedInactiveProductCount;

  return result;
}

// 若 parsedProduct 的 sourceCategoryId 不符本次呼叫目標，直接中止，避免跨分類污染寫入。
function assertParsedProductBelongsToCategory(
  parsedProduct: ParsedCoolpcProduct,
  sourceCategoryId: string,
): void {
  if (parsedProduct.sourceCategoryId !== sourceCategoryId) {
    throw new Error(
      `Parsed product category mismatch: expected ${sourceCategoryId}, got ${parsedProduct.sourceCategoryId}.`,
    );
  }
}
