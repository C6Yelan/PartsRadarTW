// apps/crawler/src/coolpc/product-write/item-writer.ts
import type { ParsedCoolpcProduct } from "../parser";
import type {
  CoolpcProductWriteDelegates,
  ExistingCurrentPriceSnapshot,
  ExistingProductForPriceWrite,
  ProductCreateData,
  ProductSeenUpdateData,
  WriteCoolpcProductPricesResult,
} from "./types";

type ProductItemWriteResult = Pick<
  WriteCoolpcProductPricesResult,
  | "createdProductCount"
  | "createdProductIds"
  | "updatedProductCount"
  | "priceSnapshotCreatedCount"
  | "priceUnchangedCount"
>;

export async function writeProductItem({
  client,
  crawlRunId,
  rawSnapshotId,
  item,
}: {
  client: CoolpcProductWriteDelegates;
  crawlRunId: string;
  rawSnapshotId: string | null;
  item: ParsedCoolpcProduct;
}): Promise<ProductItemWriteResult> {
  const existingProduct = await findProduct(client, item);

  if (!existingProduct) {
    // First sighting must create the complete read path in one pass:
    // product -> price_snapshot -> current_price.
    const productId = await createProductWithCurrentPrice({
      client,
      crawlRunId,
      rawSnapshotId,
      item,
    });
    return {
      createdProductCount: 1,
      createdProductIds: [productId],
      updatedProductCount: 0,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
    };
  }

  await updateProductSeenData(client, existingProduct.id, item);

  if (hasPriceChanged(existingProduct.currentPrice?.priceSnapshot ?? null, item)) {
    const priceSnapshot = await createPriceSnapshot({
      client,
      crawlRunId,
      rawSnapshotId,
      productId: existingProduct.id,
      item,
    });

    if (existingProduct.currentPrice) {
      await client.currentPrice.update({
        where: { productId: existingProduct.id },
        data: {
          priceSnapshotId: priceSnapshot.id,
          lastSeenAt: item.fetchedAt,
          priceChangedAt: item.fetchedAt,
        },
        select: { productId: true },
      });
    } else {
      await createCurrentPrice(client, existingProduct.id, priceSnapshot.id, item.fetchedAt);
    }

    return {
      createdProductCount: 0,
      createdProductIds: [],
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
    };
  }

  // Same price means the product is still present, but price history should not
  // grow with duplicate snapshots on every crawl.
  await client.currentPrice.update({
    where: { productId: existingProduct.id },
    data: { lastSeenAt: item.fetchedAt },
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
  item: ParsedCoolpcProduct,
): Promise<ExistingProductForPriceWrite | null> {
  // The current price row points to the latest price snapshot. Loading that
  // snapshot lets us decide whether this crawl needs a new history row.
  return client.product.findUnique({
    where: {
      sourceCategoryId_ibuyToken: {
        sourceCategoryId: item.sourceCategoryId,
        ibuyToken: item.ibuyToken,
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
  item,
}: {
  client: CoolpcProductWriteDelegates;
  crawlRunId: string;
  rawSnapshotId: string | null;
  item: ParsedCoolpcProduct;
}): Promise<string> {
  const product = await client.product.create({
    data: createProductData(item),
    select: { id: true },
  });
  const priceSnapshot = await createPriceSnapshot({
    client,
    crawlRunId,
    rawSnapshotId,
    productId: product.id,
    item,
  });

  await createCurrentPrice(client, product.id, priceSnapshot.id, item.fetchedAt);

  return product.id;
}

function updateProductSeenData(
  client: CoolpcProductWriteDelegates,
  productId: string,
  item: ParsedCoolpcProduct,
): Promise<{ id: string }> {
  // A successfully parsed item means the product is present again. If it had
  // been counted as missing or marked inactive, the same source identity resumes
  // its existing price history instead of creating a replacement product.
  return client.product.update({
    where: { id: productId },
    data: buildProductSeenUpdateData(item),
    select: { id: true },
  });
}

function buildProductSeenUpdateData(item: ParsedCoolpcProduct): ProductSeenUpdateData {
  return {
    name: item.name,
    normalizedName: item.normalizedName,
    vendorSlug: item.vendorSlug,
    vendorName: item.vendorName,
    ...(item.primaryImageUrl
      ? {
          primaryImageUrl: item.primaryImageUrl,
          primaryImageCheckedAt: item.fetchedAt,
        }
      : {}),
    sourceUrl: item.sourceUrl,
    isActive: true,
    missingSince: null,
    missingSeenCount: 0,
    lastSeenAt: item.fetchedAt,
  };
}

function createPriceSnapshot({
  client,
  crawlRunId,
  rawSnapshotId,
  productId,
  item,
}: {
  client: CoolpcProductWriteDelegates;
  crawlRunId: string;
  rawSnapshotId: string | null;
  productId: string;
  item: ParsedCoolpcProduct;
}): Promise<{ id: string }> {
  return client.priceSnapshot.create({
    data: {
      productId,
      price: item.price,
      currency: item.currency,
      capturedAt: item.fetchedAt,
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

function createProductData(item: ParsedCoolpcProduct): ProductCreateData {
  return {
    sourceCategoryId: item.sourceCategoryId,
    ibuyToken: item.ibuyToken,
    name: item.name,
    normalizedName: item.normalizedName,
    vendorSlug: item.vendorSlug,
    vendorName: item.vendorName,
    primaryImageUrl: item.primaryImageUrl,
    primaryImageCheckedAt: item.primaryImageUrl ? item.fetchedAt : null,
    sourceUrl: item.sourceUrl,
    isActive: true,
    missingSince: null,
    missingSeenCount: 0,
    firstSeenAt: item.fetchedAt,
    lastSeenAt: item.fetchedAt,
  };
}

function hasPriceChanged(
  currentSnapshot: ExistingCurrentPriceSnapshot | null,
  item: ParsedCoolpcProduct,
): boolean {
  return (
    !currentSnapshot ||
    currentSnapshot.price !== item.price ||
    currentSnapshot.currency !== item.currency
  );
}
