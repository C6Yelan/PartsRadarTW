// apps/crawler/src/coolpc/product-write/item-writer.ts
// 角色：將單筆已解析的 Coolpc 商品觀測資料，寫入商品主檔並同步價格歷史與 current_price 狀態。
import type { ParsedCoolpcProduct } from "../parser";
import type {
  CoolpcProductWriteDelegates,
  ExistingCurrentPriceSnapshot,
  ExistingProductForPriceWrite,
  ProductCreateData,
  ProductSeenUpdateData,
  WriteCoolpcCategoryProductObservationResult,
} from "./types";

type ObservedProductWriteResult = Pick<
  WriteCoolpcCategoryProductObservationResult,
  | "createdProductCount"
  | "createdProductIds"
  | "updatedProductCount"
  | "priceSnapshotCreatedCount"
  | "priceUnchangedCount"
>;

export async function writeObservedProduct({
  client,
  crawlRunId,
  rawSnapshotId,
  parsedProduct,
}: {
  client: CoolpcProductWriteDelegates;
  crawlRunId: string;
  rawSnapshotId: string | null;
  parsedProduct: ParsedCoolpcProduct;
}): Promise<ObservedProductWriteResult> {
  // 每次抓到一筆商品時，先以 sourceCategoryId + ibuyToken 判斷是否已存在商品記錄。
  const existingProduct = await findProduct(client, parsedProduct);

  if (!existingProduct) {
    // 首次看到此商品時，用一個流程建立：商品主檔 -> 價格快照 -> current_price。
    const productId = await createProductWithCurrentPrice({
      client,
      crawlRunId,
      rawSnapshotId,
      parsedProduct,
    });
    return {
      createdProductCount: 1,
      createdProductIds: [productId],
      updatedProductCount: 0,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
    };
  }

  await updateProductSeenData(client, existingProduct, parsedProduct);

  if (hasPriceChanged(existingProduct.currentPrice?.priceSnapshot ?? null, parsedProduct)) {
    const priceSnapshot = await createPriceSnapshot({
      client,
      crawlRunId,
      rawSnapshotId,
      productId: existingProduct.id,
      parsedProduct,
    });

    if (existingProduct.currentPrice) {
      await client.currentPrice.update({
        where: { productId: existingProduct.id },
        data: {
          priceSnapshotId: priceSnapshot.id,
          lastSeenAt: parsedProduct.fetchedAt,
          priceChangedAt: parsedProduct.fetchedAt,
        },
        select: { productId: true },
      });
    } else {
      await createCurrentPrice(
        client,
        existingProduct.id,
        priceSnapshot.id,
        parsedProduct.fetchedAt,
      );
    }

    return {
      createdProductCount: 0,
      createdProductIds: [],
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
    };
  }

  // 價格未變，代表商品仍存在；不新增快照避免歷史資料在每次爬取時重複膨脹。
  await client.currentPrice.update({
    where: { productId: existingProduct.id },
    data: { lastSeenAt: parsedProduct.fetchedAt },
    select: { productId: true },
  });

  return {
    createdProductCount: 0,
    createdProductIds: [],
    updatedProductCount: 1,
    priceSnapshotCreatedCount: 0,
    priceUnchangedCount: 1,
  };
}

function findProduct(
  client: CoolpcProductWriteDelegates,
  parsedProduct: ParsedCoolpcProduct,
): Promise<ExistingProductForPriceWrite | null> {
  // 先抓出既有商品，並一併帶回目前最新的 current_price 與對應快照，
  // 供價格是否異動的判斷使用。
  return client.product.findUnique({
    where: {
      sourceCategoryId_ibuyToken: {
        sourceCategoryId: parsedProduct.sourceCategoryId,
        ibuyToken: parsedProduct.ibuyToken,
      },
    },
    include: {
      currentPrice: {
        include: {
          priceSnapshot: true,
        },
      },
    },
  });
}

async function createProductWithCurrentPrice({
  client,
  crawlRunId,
  rawSnapshotId,
  parsedProduct,
}: {
  client: CoolpcProductWriteDelegates;
  crawlRunId: string;
  rawSnapshotId: string | null;
  parsedProduct: ParsedCoolpcProduct;
}): Promise<string> {
  // 新增商品時，需同時建立第一筆價格快照，並立即建立 current_price 指向它。
  const product = await client.product.create({
    data: createProductData(parsedProduct),
    select: { id: true },
  });
  const priceSnapshot = await createPriceSnapshot({
    client,
    crawlRunId,
    rawSnapshotId,
    productId: product.id,
    parsedProduct,
  });

  await createCurrentPrice(client, product.id, priceSnapshot.id, parsedProduct.fetchedAt);

  return product.id;
}

function updateProductSeenData(
  client: CoolpcProductWriteDelegates,
  existingProduct: ExistingProductForPriceWrite,
  parsedProduct: ParsedCoolpcProduct,
): Promise<{ id: string }> {
  // 商品重新被解析到，更新最後看到時間、名稱、網址等欄位並恢復啟用，
  // 不重建商品資料，保留既有價格歷史。
  return client.product.update({
    where: { id: existingProduct.id },
    data: buildProductSeenUpdateData(existingProduct, parsedProduct),
    select: { id: true },
  });
}

function buildProductSeenUpdateData(
  existingProduct: ExistingProductForPriceWrite,
  parsedProduct: ParsedCoolpcProduct,
): ProductSeenUpdateData {
  // 組裝「再次看到」時的更新欄位；若缺少圖片時不清空既有 primaryImageUrl。
  return {
    name: parsedProduct.name,
    normalizedName: parsedProduct.normalizedName,
    vendorSlug: parsedProduct.vendorSlug,
    vendorName: parsedProduct.vendorName,
    filterTags: parsedProduct.filterTags,
    ...(parsedProduct.primaryImageUrl
      ? {
          primaryImageUrl: parsedProduct.primaryImageUrl,
          primaryImageCheckedAt: parsedProduct.fetchedAt,
          ...(parsedProduct.primaryImageUrl !== existingProduct.primaryImageUrl
            ? {
                imageCachedAt: null,
                imageCacheCheckedAt: null,
                imageCacheFailureCount: 0 as const,
                imageCacheLastError: null,
                imageCacheLastErrorKind: null,
                imageCacheLastHttpStatus: null,
                imageCacheFailureSince: null,
                imageCacheLastSuccessAt: null,
                imageCacheNextRetryAt: null,
              }
            : {}),
        }
      : {}),
    sourceUrl: parsedProduct.sourceUrl,
    isActive: true,
    isExcluded: false,
    exclusionReason: null,
    missingSince: null,
    missingSeenCount: 0,
    lastSeenAt: parsedProduct.fetchedAt,
  };
}

function createPriceSnapshot({
  client,
  crawlRunId,
  rawSnapshotId,
  productId,
  parsedProduct,
}: {
  client: CoolpcProductWriteDelegates;
  crawlRunId: string;
  rawSnapshotId: string | null;
  productId: string;
  parsedProduct: ParsedCoolpcProduct;
}): Promise<{ id: string }> {
  // 價格異動時建立新的價格快照，保留變價軌跡與爬取來源關聯。
  return client.priceSnapshot.create({
    data: {
      productId,
      price: parsedProduct.price,
      currency: parsedProduct.currency,
      capturedAt: parsedProduct.fetchedAt,
      crawlRunId,
      rawSnapshotId,
    },
    select: { id: true },
  });
}

function createCurrentPrice(
  client: CoolpcProductWriteDelegates,
  productId: string,
  priceSnapshotId: string,
  seenAt: Date,
): Promise<{ productId: string }> {
  // 建立 current_price 的初始狀態，lastSeenAt 與 priceChangedAt 使用同一抓取時間。
  return client.currentPrice.create({
    data: {
      productId,
      priceSnapshotId,
      lastSeenAt: seenAt,
      priceChangedAt: seenAt,
    },
    select: { productId: true },
  });
}

function createProductData(parsedProduct: ParsedCoolpcProduct): ProductCreateData {
  // 組裝商品建檔資料，將狀態設為啟用並重置缺漏相關欄位。
  return {
    sourceCategoryId: parsedProduct.sourceCategoryId,
    ibuyToken: parsedProduct.ibuyToken,
    name: parsedProduct.name,
    normalizedName: parsedProduct.normalizedName,
    vendorSlug: parsedProduct.vendorSlug,
    vendorName: parsedProduct.vendorName,
    filterTags: parsedProduct.filterTags,
    primaryImageUrl: parsedProduct.primaryImageUrl,
    primaryImageCheckedAt: parsedProduct.primaryImageUrl ? parsedProduct.fetchedAt : null,
    sourceUrl: parsedProduct.sourceUrl,
    isActive: true,
    isExcluded: false,
    exclusionReason: null,
    missingSince: null,
    missingSeenCount: 0,
    firstSeenAt: parsedProduct.fetchedAt,
    lastSeenAt: parsedProduct.fetchedAt,
  };
}

function hasPriceChanged(
  currentSnapshot: ExistingCurrentPriceSnapshot | null,
  parsedProduct: ParsedCoolpcProduct,
): boolean {
  // 價格比對：若尚無 current snapshot，或價格、幣別任一不同都視為變動。
  return (
    !currentSnapshot ||
    currentSnapshot.price !== parsedProduct.price ||
    currentSnapshot.currency !== parsedProduct.currency
  );
}
