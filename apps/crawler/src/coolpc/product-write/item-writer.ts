// apps/crawler/src/coolpc/product-write/item-writer.ts
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
  const existingProduct = await findProduct(client, parsedProduct);

  if (!existingProduct) {
    // First sighting must create the complete read path in one pass:
    // product -> price_snapshot -> current_price.
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

  await updateProductSeenData(client, existingProduct.id, parsedProduct);

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

  // Same price means the product is still present, but price history should not
  // grow with duplicate snapshots on every crawl.
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
  // The current price row points to the latest price snapshot. Loading that
  // snapshot lets us decide whether this crawl needs a new history row.
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
  productId: string,
  parsedProduct: ParsedCoolpcProduct,
): Promise<{ id: string }> {
  // A successfully parsed item means the product is present again. If it had
  // been counted as missing or marked inactive, the same source identity resumes
  // its existing price history instead of creating a replacement product.
  return client.product.update({
    where: { id: productId },
    data: buildProductSeenUpdateData(parsedProduct),
    select: { id: true },
  });
}

function buildProductSeenUpdateData(parsedProduct: ParsedCoolpcProduct): ProductSeenUpdateData {
  return {
    name: parsedProduct.name,
    normalizedName: parsedProduct.normalizedName,
    vendorSlug: parsedProduct.vendorSlug,
    vendorName: parsedProduct.vendorName,
    ...(parsedProduct.primaryImageUrl
      ? {
          primaryImageUrl: parsedProduct.primaryImageUrl,
          primaryImageCheckedAt: parsedProduct.fetchedAt,
        }
      : {}),
    sourceUrl: parsedProduct.sourceUrl,
    isActive: true,
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
  return {
    sourceCategoryId: parsedProduct.sourceCategoryId,
    ibuyToken: parsedProduct.ibuyToken,
    name: parsedProduct.name,
    normalizedName: parsedProduct.normalizedName,
    vendorSlug: parsedProduct.vendorSlug,
    vendorName: parsedProduct.vendorName,
    primaryImageUrl: parsedProduct.primaryImageUrl,
    primaryImageCheckedAt: parsedProduct.primaryImageUrl ? parsedProduct.fetchedAt : null,
    sourceUrl: parsedProduct.sourceUrl,
    isActive: true,
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
  return (
    !currentSnapshot ||
    currentSnapshot.price !== parsedProduct.price ||
    currentSnapshot.currency !== parsedProduct.currency
  );
}
