// apps/crawler/src/coolpc/product-write/types.ts
// 定義 CoolPC 產品觀測寫入流程所需的輸入/輸出與資料寫入介面，讓流程邏輯與資料存取邊界解耦。
import type { ParsedCoolpcProduct } from "../parser";

// 寫入一次分類結果的輸入參數：含 crawl run 追蹤、原始快照、分類 ID 及已解析商品清單。
export interface WriteCoolpcCategoryProductObservationOptions {
  client: CoolpcProductWriteClient;
  crawlRunId: string;
  rawSnapshotId?: string | null;
  sourceCategoryId: string;
  fetchedAt: Date;
  parsedProducts: ParsedCoolpcProduct[];
}

// 單次分類寫入的結果摘要，供上游彙總與排程監控顯示。
export interface WriteCoolpcCategoryProductObservationResult {
  processedItemCount: number;
  createdProductCount: number;
  createdProductIds: string[];
  updatedProductCount: number;
  priceSnapshotCreatedCount: number;
  priceUnchangedCount: number;
  missingProductUpdatedCount: number;
  markedInactiveProductCount: number;
}

// 僅保留寫入流程實際會使用的 Prisma delegates，避免商品寫入模組綁死整個 PrismaClient（測試可替代注入）。
export interface CoolpcProductWriteClient extends CoolpcProductWriteDelegates {
  $transaction<T>(operation: (client: CoolpcProductWriteDelegates) => Promise<T>): Promise<T>;
}

// Prisma 寫入委派方法集合：product、priceSnapshot、currentPrice 在此模組共用的最小介面。
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

// 缺漏判斷只需要的欄位集合（active 狀態與缺漏計數）。
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

// 建立新產品時固定寫入的欄位：新品一律視為啟用，並重置缺漏相關欄位。
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

// 再次抓到既有產品時更新的欄位，維持既有商品 identity，但更新可觀測到的顯示/連結資訊。
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

// 連續缺漏時用來標記停用與遞增缺漏次數。
export interface ProductMissingUpdateData {
  isActive: boolean;
  missingSince: Date;
  missingSeenCount: number;
}

export type ProductUpdateData = ProductSeenUpdateData | ProductMissingUpdateData;

// 價格快照是變價歷史的最小單位：每次判定變價都新增一筆快照。
export interface PriceSnapshotCreateData {
  productId: string;
  price: number;
  currency: ParsedCoolpcProduct["currency"];
  capturedAt: Date;
  crawlRunId: string;
  rawSnapshotId: string | null;
}

// current_price 維持「目前可見價格」與觀測時間，並指向對應快照。
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
