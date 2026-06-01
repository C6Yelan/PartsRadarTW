import type { CoolpcProductWriteDelegates, WriteCoolpcProductPricesResult } from "./types";

const MISSING_SUCCESSFUL_CRAWLS_BEFORE_INACTIVE = 6;

export async function markMissingProducts({
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
