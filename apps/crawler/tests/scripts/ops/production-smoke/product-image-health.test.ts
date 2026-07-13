import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkMissingProductImages,
  checkSourceImageFetchFailures,
} from "../../../../src/scripts/ops/production-smoke/checks/product-health";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("source image fetch failure smoke check", () => {
  it.each([
    [99, "OK"],
    [100, "WARN"],
    [299, "WARN"],
    [300, "FAIL"],
  ] as const)("maps %i affected products to %s", async (count, status) => {
    const findMany = vi.fn(async () => createFailures(count));
    const result = await checkSourceImageFetchFailures(
      { product: { findMany } } as never,
      {
        sourceImageFailureMinConsecutive: 3,
        sourceImageFailureWarnCount: 100,
        sourceImageFailureFailCount: 300,
      } as never,
      new Date("2026-07-13T12:00:00.000Z"),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          imageCacheFailureCount: { gte: 3 },
        },
      }),
    );
    expect(result.status).toBe(status);
  });

  it("reports the consecutive count and source failure details", async () => {
    const result = await checkSourceImageFetchFailures(
      { product: { findMany: async () => createFailures(1) } } as never,
      {
        sourceImageFailureMinConsecutive: 3,
        sourceImageFailureWarnCount: 1,
        sourceImageFailureFailCount: 300,
      } as never,
      new Date("2026-07-13T12:00:00.000Z"),
    );

    expect(result).toEqual({
      name: "source image fetch failures",
      status: "WARN",
      message:
        "1 product(s) / 1 distinct URL(s) / longest 24.00h; id=product-1 failures=3 url=https://www.coolpc.com.tw/images/product-1.jpg reason=http/HTTP 403/source returned an error",
    });
  });
});

describe("missing product image smoke check", () => {
  it.each([
    [29, "OK"],
    [30, "WARN"],
    [99, "WARN"],
    [100, "FAIL"],
  ] as const)("maps %i missing display images to %s", async (count, status) => {
    const imageDir = await mkdtemp(join(tmpdir(), "partsradar-missing-images-"));
    tempRoots.push(imageDir);
    const products = Array.from({ length: count }, (_, index) => ({ id: `product-${index + 1}` }));

    const result = await checkMissingProductImages(
      { product: { findMany: async () => products } } as never,
      {
        productImageStorageDir: imageDir,
        missingImageWarnCount: 30,
        missingImageFailCount: 100,
      } as never,
    );

    expect(result).toMatchObject({
      name: "missing product images",
      status,
    });
  });
});

function createFailures(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `product-${index + 1}`,
    primaryImageUrl: `https://www.coolpc.com.tw/images/product-${index + 1}.jpg`,
    imageCacheLastError: "source returned an error",
    imageCacheLastErrorKind: "http",
    imageCacheLastHttpStatus: 403,
    imageCacheFailureCount: 3,
    imageCacheFailureSince: new Date("2026-07-12T12:00:00.000Z"),
  }));
}
