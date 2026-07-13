// apps/crawler/src/coolpc/product-write/missing-products.ts
// 標記某分類中「本次未抓到」的商品為缺漏，達門檻後切為停用，維持缺漏計數。
import type {
  CoolpcProductWriteDelegates,
  WriteCoolpcCategoryProductObservationResult,
} from "./types";

// 連續幾次成功回報才轉為停用，避免一次缺頁或暫時抓不到就誤下架。
const MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE = 6;

export async function markMissingProducts({
  client,
  sourceCategoryId,
  fetchedAt,
  presentIbuyTokens,
  excludedIbuyTokens = new Set(),
}: {
  client: CoolpcProductWriteDelegates;
  sourceCategoryId: string;
  fetchedAt: Date;
  presentIbuyTokens: ReadonlySet<string>;
  excludedIbuyTokens?: ReadonlySet<string>;
}): Promise<
  Pick<
    WriteCoolpcCategoryProductObservationResult,
    "missingProductUpdatedCount" | "markedInactiveProductCount"
  >
> {
  // 先取出該分類下全部產品的缺漏狀態，再逐筆依 presentIbuyTokens 進行比對與更新。
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
  // 累積本次標記的變更數，供上層回報與統計使用。
  const result = {
    missingProductUpdatedCount: 0,
    markedInactiveProductCount: 0,
  };

  for (const product of products) {
    // 若本次已抓到該 ibuyToken，視為仍存活，跳過缺漏邏輯。
    if (presentIbuyTokens.has(product.ibuyToken)) {
      continue;
    }

    if (excludedIbuyTokens.has(product.ibuyToken)) {
      if (
        !product.isActive &&
        product.missingSeenCount >= MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE
      ) {
        continue;
      }

      await client.product.update({
        where: { id: product.id },
        data: {
          isActive: false,
          missingSince: product.missingSince ?? fetchedAt,
          missingSeenCount: Math.max(
            product.missingSeenCount,
            MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE,
          ),
        },
        select: { id: true },
      });
      result.missingProductUpdatedCount += 1;
      if (product.isActive) {
        result.markedInactiveProductCount += 1;
      }
      continue;
    }

    // 已停用且已經達到次數上限者，保留現狀以避免重複更新。
    if (
      !product.isActive &&
      product.missingSeenCount >= MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE
    ) {
      continue;
    }

    const missingSeenCount = product.missingSeenCount + 1;
    const shouldBeInactive = missingSeenCount >= MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE;

    // 缺漏只會在「分類成功解析」後執行，本次抓取失敗與 parser error 不會進這條路徑，
    // 避免因網路異常或暫時解析錯誤把在賣商品誤判為停用。
    await client.product.update({
      where: { id: product.id },
      data: {
        isActive: shouldBeInactive ? false : product.isActive,
        missingSince: product.missingSince ?? fetchedAt,
        missingSeenCount,
      },
      select: { id: true },
    });

    // 只要這次沒抓到就計入「缺漏更新」，若從 active 轉為 inactive 則再加上下架計數。
    result.missingProductUpdatedCount += 1;
    if (product.isActive && shouldBeInactive) {
      result.markedInactiveProductCount += 1;
    }
  }

  return result;
}
