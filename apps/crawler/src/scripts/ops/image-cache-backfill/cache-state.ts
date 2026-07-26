// 寫入圖片快取成功、失敗及下次重試狀態。

import type { ImageCacheStateClient, ProcessResult, ProductImageCandidate } from "./types";

const MAX_CONSECUTIVE_IMAGE_FAILURES = 5;
const IMAGE_RETRY_BASE_MS = 60 * 60 * 1000;
const IMAGE_RETRY_LONG_COOLDOWN_MS = 7 * 24 * IMAGE_RETRY_BASE_MS;

export async function markImageCacheReady(
  client: ImageCacheStateClient,
  productId: string,
  checkedAt: Date,
): Promise<void> {
  await client.product.update({
    where: { id: productId },
    data: {
      imageCachedAt: checkedAt,
      imageCacheCheckedAt: checkedAt,
      imageCacheFailureCount: 0,
      imageCacheLastError: null,
      imageCacheLastErrorKind: null,
      imageCacheLastHttpStatus: null,
      imageCacheFailureSince: null,
      imageCacheLastSuccessAt: checkedAt,
      imageCacheNextRetryAt: null,
    },
  });
}

export async function markImageCacheFailure(
  client: ImageCacheStateClient,
  candidate: ProductImageCandidate,
  result: ProcessResult,
): Promise<void> {
  const attemptedAt = new Date();
  const failureCount = Math.min(
    candidate.imageCacheFailureCount + 1,
    MAX_CONSECUTIVE_IMAGE_FAILURES,
  );
  const retryDelayMs =
    failureCount >= MAX_CONSECUTIVE_IMAGE_FAILURES
      ? IMAGE_RETRY_LONG_COOLDOWN_MS
      : IMAGE_RETRY_BASE_MS * 2 ** (failureCount - 1);
  const data = {
    imageCachedAt: null,
    imageCacheCheckedAt: attemptedAt,
    imageCacheFailureCount: failureCount,
    imageCacheLastError: (result.errorMessage ?? result.status).slice(0, 1000),
    imageCacheLastErrorKind: result.errorKind ?? "unknown",
    imageCacheLastHttpStatus: result.httpStatus ?? null,
    imageCacheFailureSince: candidate.imageCacheFailureSince ?? attemptedAt,
    imageCacheNextRetryAt: new Date(attemptedAt.getTime() + retryDelayMs),
  };

  if (candidate.primaryImageUrl) {
    await client.product.updateMany({
      where: { primaryImageUrl: candidate.primaryImageUrl },
      data,
    });
    return;
  }

  await client.product.update({ where: { id: candidate.id }, data });
}
