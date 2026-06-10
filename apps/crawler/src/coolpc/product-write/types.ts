// apps/crawler/src/coolpc/product-write/types.ts
import type { ParsedCoolpcProduct } from "../parser";

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

// Keep this client shape limited to the delegates this slice actually writes.
// That avoids binding the product writer to a full PrismaClient in unit tests.
export interface CoolpcProductWriteClient extends CoolpcProductWriteDelegates {
  $transaction<T>(operation: (client: CoolpcProductWriteDelegates) => Promise<T>): Promise<T>;
}

export interface CoolpcProductWriteDelegates {
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

export interface ProductIdentity {
  sourceCategoryId: string;
  ibuyToken: string;
}

export interface ExistingProductForPriceWrite {
  id: string;
  currentPrice: {
    productId: string;
    priceSnapshotId: string;
    lastSeenAt: Date;
    priceChangedAt: Date;
    priceSnapshot: ExistingCurrentPriceSnapshot;
  } | null;
}

export interface ExistingProductForMissingWrite {
  id: string;
  ibuyToken: string;
  isActive: boolean;
  missingSince: Date | null;
  missingSeenCount: number;
}

export interface ExistingCurrentPriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: ParsedCoolpcProduct["currency"];
}

export interface ProductCreateData {
  sourceCategoryId: string;
  ibuyToken: string;
  name: string;
  normalizedName: string;
  vendorSlug: string | null;
  vendorName: string | null;
  primaryImageUrl: string | null;
  primaryImageCheckedAt: Date | null;
  sourceUrl: string;
  isActive: true;
  missingSince: null;
  missingSeenCount: 0;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface ProductSeenUpdateData {
  name: string;
  normalizedName: string;
  vendorSlug: string | null;
  vendorName: string | null;
  primaryImageUrl?: string;
  primaryImageCheckedAt?: Date;
  sourceUrl: string;
  isActive: true;
  missingSince: null;
  missingSeenCount: 0;
  lastSeenAt: Date;
}

export interface ProductMissingUpdateData {
  isActive: boolean;
  missingSince: Date;
  missingSeenCount: number;
}

export type ProductUpdateData = ProductSeenUpdateData | ProductMissingUpdateData;

export interface PriceSnapshotCreateData {
  productId: string;
  price: number;
  currency: ParsedCoolpcProduct["currency"];
  capturedAt: Date;
  crawlRunId: string;
  rawSnapshotId: string | null;
}

export interface CurrentPriceCreateData {
  productId: string;
  priceSnapshotId: string;
  lastSeenAt: Date;
  priceChangedAt: Date;
}

export interface CurrentPriceUpdateData {
  priceSnapshotId?: string;
  lastSeenAt: Date;
  priceChangedAt?: Date;
}
