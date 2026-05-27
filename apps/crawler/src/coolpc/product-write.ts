import type { ParsedCoolpcProduct } from "./parser";

export interface WriteCoolpcProductPricesOptions {
  client: CoolpcProductWriteClient;
  crawlRunId: string;
  rawSnapshotId?: string | null;
  sourceCategoryId: string;
  fetchedAt: Date;
  items: ParsedCoolpcProduct[];
}

export interface WriteCoolpcProductPricesResult {
  processedItemCount: number;
  createdProductCount: number;
  updatedProductCount: number;
  priceSnapshotCreatedCount: number;
  priceUnchangedCount: number;
  missingProductUpdatedCount: number;
  markedInactiveProductCount: number;
}

const MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE = 6;

// Keep this client shape limited to the delegates this slice actually writes.
// That avoids binding the product writer to a full PrismaClient in unit tests.
export interface CoolpcProductWriteClient extends CoolpcProductWriteDelegates {
  $transaction<T>(operation: (client: CoolpcProductWriteDelegates) => Promise<T>): Promise<T>;
}

interface CoolpcProductWriteDelegates {
  product: {
    findUnique(args: {
      where: {
        sourceCategoryId_ibuyToken: ProductIdentity;
      };
      include: {
        currentPrice: {
          include: {
            priceSnapshot: true;
          };
        };
      };
    }): Promise<ExistingProductForPriceWrite | null>;
    findMany(args: {
      where: { sourceCategoryId: string };
      select: {
        id: true;
        ibuyToken: true;
        isActive: true;
        missingSince: true;
        missingSeenCount: true;
      };
    }): Promise<ExistingProductForMissingWrite[]>;
    create(args: { data: ProductCreateData; select: { id: true } }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: ProductUpdateData;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  priceSnapshot: {
    create(args: { data: PriceSnapshotCreateData; select: { id: true } }): Promise<{ id: string }>;
  };
  currentPrice: {
    create(args: {
      data: CurrentPriceCreateData;
      select: { productId: true };
    }): Promise<{ productId: string }>;
    update(args: {
      where: { productId: string };
      data: CurrentPriceUpdateData;
      select: { productId: true };
    }): Promise<{ productId: string }>;
  };
}

interface ProductIdentity {
  sourceCategoryId: string;
  ibuyToken: string;
}

interface ExistingProductForPriceWrite {
  id: string;
  currentPrice: {
    productId: string;
    priceSnapshotId: string;
    lastSeenAt: Date;
    priceChangedAt: Date;
    priceSnapshot: ExistingCurrentPriceSnapshot;
  } | null;
}

interface ExistingProductForMissingWrite {
  id: string;
  ibuyToken: string;
  isActive: boolean;
  missingSince: Date | null;
  missingSeenCount: number;
}

interface ExistingCurrentPriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: ParsedCoolpcProduct["currency"];
}

interface ProductCreateData {
  sourceCategoryId: string;
  ibuyToken: string;
  name: string;
  normalizedName: string;
  sourceUrl: string;
  isActive: true;
  missingSince: null;
  missingSeenCount: 0;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface ProductSeenUpdateData {
  name: string;
  normalizedName: string;
  sourceUrl: string;
  isActive: true;
  missingSince: null;
  missingSeenCount: 0;
  lastSeenAt: Date;
}

interface ProductMissingUpdateData {
  isActive: boolean;
  missingSince: Date;
  missingSeenCount: number;
}

type ProductUpdateData = ProductSeenUpdateData | ProductMissingUpdateData;

interface PriceSnapshotCreateData {
  productId: string;
  price: number;
  currency: ParsedCoolpcProduct["currency"];
  capturedAt: Date;
  crawlRunId: string;
  rawSnapshotId: string | null;
}

interface CurrentPriceCreateData {
  productId: string;
  priceSnapshotId: string;
  lastSeenAt: Date;
  priceChangedAt: Date;
}

interface CurrentPriceUpdateData {
  priceSnapshotId?: string;
  lastSeenAt: Date;
  priceChangedAt?: Date;
}

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
    updatedProductCount: 0,
    priceSnapshotCreatedCount: 0,
    priceUnchangedCount: 0,
    missingProductUpdatedCount: 0,
    markedInactiveProductCount: 0,
  };
  const presentIbuyTokens = new Set<string>();

  for (const item of items) {
    if (item.sourceCategoryId !== sourceCategoryId) {
      throw new Error(
        `Product item category mismatch: expected ${sourceCategoryId}, got ${item.sourceCategoryId}.`,
      );
    }

    presentIbuyTokens.add(item.ibuyToken);
    const existingProduct = await findProduct(client, item);

    if (!existingProduct) {
      // First sighting must create the complete read path in one pass:
      // product -> price_snapshot -> current_price.
      await createProductWithCurrentPrice({ client, crawlRunId, rawSnapshotId, item });
      result.createdProductCount += 1;
      result.priceSnapshotCreatedCount += 1;
      continue;
    }

    await updateProductSeenData(client, existingProduct.id, item);
    result.updatedProductCount += 1;

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

      result.priceSnapshotCreatedCount += 1;
      continue;
    }

    // Same price means the product is still present, but price history should
    // not grow with duplicate snapshots on every crawl.
    await client.currentPrice.update({
      where: { productId: existingProduct.id },
      data: { lastSeenAt: item.fetchedAt },
      select: { productId: true },
    });
    result.priceUnchangedCount += 1;
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
}): Promise<void> {
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
    data: {
      name: item.name,
      normalizedName: item.normalizedName,
      sourceUrl: item.sourceUrl,
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: item.fetchedAt,
    },
    select: { id: true },
  });
}

async function markMissingProducts({
  client,
  sourceCategoryId,
  fetchedAt,
  presentIbuyTokens,
}: {
  client: CoolpcProductWriteDelegates;
  sourceCategoryId: string;
  fetchedAt: Date;
  presentIbuyTokens: ReadonlySet<string>;
}): Promise<
  Pick<WriteCoolpcProductPricesResult, "missingProductUpdatedCount" | "markedInactiveProductCount">
> {
  const products = await client.product.findMany({
    where: { sourceCategoryId },
    select: {
      id: true,
      ibuyToken: true,
      isActive: true,
      missingSince: true,
      missingSeenCount: true,
    },
  });
  const result = {
    missingProductUpdatedCount: 0,
    markedInactiveProductCount: 0,
  };

  for (const product of products) {
    if (presentIbuyTokens.has(product.ibuyToken)) {
      continue;
    }

    if (
      !product.isActive &&
      product.missingSeenCount >= MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE
    ) {
      continue;
    }

    const missingSeenCount = product.missingSeenCount + 1;
    const shouldBeInactive = missingSeenCount >= MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE;

    // Missing is counted only after a successful parse of this category. Failed
    // fetches and parser errors never call this writer, so they cannot make a
    // product look inactive because the source response was unreliable.
    await client.product.update({
      where: { id: product.id },
      data: {
        isActive: shouldBeInactive ? false : product.isActive,
        missingSince: product.missingSince ?? fetchedAt,
        missingSeenCount,
      },
      select: { id: true },
    });

    result.missingProductUpdatedCount += 1;
    if (product.isActive && shouldBeInactive) {
      result.markedInactiveProductCount += 1;
    }
  }

  return result;
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
