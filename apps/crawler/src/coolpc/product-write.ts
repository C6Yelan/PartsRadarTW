// apps/crawler/src/coolpc/product-write.ts
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

export async function writeCoolpcCategoryProductObservation({
  client,
  crawlRunId,
  rawSnapshotId = null,
  sourceCategoryId,
  fetchedAt,
  parsedProducts,
}: WriteCoolpcCategoryProductObservationOptions): Promise<WriteCoolpcCategoryProductObservationResult> {
  // Product, price snapshot, and current price must move together. The service
  // keeps the transaction boundary here instead of requiring every caller to
  // remember the same multi-table write rule.
  return client.$transaction((transactionClient) =>
    writeCoolpcCategoryProductObservationInTransaction({
      client: transactionClient,
      crawlRunId,
      rawSnapshotId,
      sourceCategoryId,
      fetchedAt,
      parsedProducts,
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
  });
  result.missingProductUpdatedCount = missingResult.missingProductUpdatedCount;
  result.markedInactiveProductCount = missingResult.markedInactiveProductCount;

  return result;
}

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
