// apps/crawler/src/coolpc/product-write.ts
import type { ParsedCoolpcProduct } from "./parser";
import { writeProductItem } from "./product-write/item-writer";
import { markMissingProducts } from "./product-write/missing-products";
import type {
  CoolpcProductWriteDelegates,
  WriteCoolpcProductPricesOptions,
  WriteCoolpcProductPricesResult,
} from "./product-write/types";

export type {
  CoolpcProductWriteClient,
  WriteCoolpcProductPricesOptions,
  WriteCoolpcProductPricesResult,
} from "./product-write/types";

export async function writeCoolpcProductPrices({
  client,
  crawlRunId,
  rawSnapshotId = null,
  sourceCategoryId,
  fetchedAt,
  items,
}: WriteCoolpcProductPricesOptions): Promise<WriteCoolpcProductPricesResult> {
  // Product, price snapshot, and current price must move together. The service
  // keeps the transaction boundary here instead of requiring every caller to
  // remember the same multi-table write rule.
  return client.$transaction((transactionClient) =>
    writeCoolpcProductPricesInTransaction({
      client: transactionClient,
      crawlRunId,
      rawSnapshotId,
      sourceCategoryId,
      fetchedAt,
      items,
    }),
  );
}

async function writeCoolpcProductPricesInTransaction({
  client,
  crawlRunId,
  rawSnapshotId,
  sourceCategoryId,
  fetchedAt,
  items,
}: Omit<WriteCoolpcProductPricesOptions, "client" | "rawSnapshotId"> & {
  client: CoolpcProductWriteDelegates;
  rawSnapshotId: string | null;
}): Promise<WriteCoolpcProductPricesResult> {
  const result: WriteCoolpcProductPricesResult = {
    processedItemCount: items.length,
    createdProductCount: 0,
    createdProductIds: [],
    updatedProductCount: 0,
    priceSnapshotCreatedCount: 0,
    priceUnchangedCount: 0,
    missingProductUpdatedCount: 0,
    markedInactiveProductCount: 0,
  };
  const presentIbuyTokens = new Set<string>();

  for (const item of items) {
    assertItemBelongsToCategory(item, sourceCategoryId);
    presentIbuyTokens.add(item.ibuyToken);

    const itemResult = await writeProductItem({
      client,
      crawlRunId,
      rawSnapshotId,
      item,
    });

    result.createdProductCount += itemResult.createdProductCount;
    result.createdProductIds.push(...itemResult.createdProductIds);
    result.updatedProductCount += itemResult.updatedProductCount;
    result.priceSnapshotCreatedCount += itemResult.priceSnapshotCreatedCount;
    result.priceUnchangedCount += itemResult.priceUnchangedCount;
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

function assertItemBelongsToCategory(
  item: ParsedCoolpcProduct,
  sourceCategoryId: string,
): void {
  if (item.sourceCategoryId !== sourceCategoryId) {
    throw new Error(
      `Product item category mismatch: expected ${sourceCategoryId}, got ${item.sourceCategoryId}.`,
    );
  }
}
