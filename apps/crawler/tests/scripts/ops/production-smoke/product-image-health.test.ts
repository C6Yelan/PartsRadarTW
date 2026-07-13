import { describe, expect, it } from "vitest";
import { checkSourceImageFetchFailures } from "../../../../src/scripts/ops/production-smoke/checks/product-health";

describe("source image fetch failure smoke check", () => {
  it("reports product, URL, HTTP status, and persistence", async () => {
    const result = await checkSourceImageFetchFailures(
      {
        product: {
          findMany: async () => [
            {
              id: "product-1",
              primaryImageUrl: "https://www.coolpc.com.tw/eval/4/shared.jpg",
              imageCacheLastError: "source returned an error",
              imageCacheLastErrorKind: "http",
              imageCacheLastHttpStatus: 403,
              imageCacheFailureSince: new Date("2026-07-12T12:00:00.000Z"),
            },
          ],
        },
      } as never,
      {
        invalidImageUrlWarnCount: 10,
        invalidImageUrlWarnUrlCount: 10,
        invalidImageUrlWarnHours: 12,
      } as never,
      new Date("2026-07-13T12:00:00.000Z"),
    );

    expect(result).toEqual({
      name: "source image fetch failures",
      status: "WARN",
      message:
        "1 product(s) / 1 distinct URL(s) / longest 24.00h; id=product-1 url=https://www.coolpc.com.tw/eval/4/shared.jpg reason=http/HTTP 403/source returned an error",
    });
  });
});
