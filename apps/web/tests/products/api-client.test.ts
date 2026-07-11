// apps/web/tests/products/api-client.test.ts
// 驗證 web API client 只讀安全 code、忽略 server message，並讓主要 loaders 共用 429 語意。

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiRequestError,
  isRateLimitedApiError,
  type PublicApiErrorCode,
  toApiRequestError,
} from "../../app/_shared/api-client";
import { fetchPriceHistory } from "../../app/products/[id]/detail/use-price-history-loader";
import { fetchProductDetail } from "../../app/products/[id]/detail/use-product-detail";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const SAFE_CODES: PublicApiErrorCode[] = [
  "invalid_query",
  "invalid_request",
  "not_found",
  "rate_limited",
  "internal_error",
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web API client errors", () => {
  it.each(SAFE_CODES)("accepts the existing safe %s code", async (code) => {
    const error = await toApiRequestError(
      Response.json({ error: { code, message: "server detail" } }, { status: 400 }),
      "Client fallback.",
    );

    expect(error).toMatchObject({
      code,
      message: "Client fallback.",
      status: 400,
    });
  });

  it("ignores unknown codes and never uses the server message", async () => {
    const error = await toApiRequestError(
      Response.json(
        {
          error: {
            code: "database_failed",
            message: "DATABASE_URL and internal stack",
          },
        },
        { status: 500 },
      ),
      "Safe fallback.",
    );

    expect(error).toMatchObject({
      code: null,
      message: "Safe fallback.",
      status: 500,
    });
  });

  it("recognizes an HTTP 429 even when its body is not JSON", async () => {
    const error = await toApiRequestError(
      new Response("temporarily limited", { status: 429 }),
      "Safe fallback.",
    );

    expect(error.code).toBeNull();
    expect(isRateLimitedApiError(error)).toBe(true);
    expect(isRateLimitedApiError(new ApiRequestError("Failed.", 500, "internal_error"))).toBe(
      false,
    );
  });
});

describe("detail data loaders", () => {
  it("preserves detail and history not-found semantics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const signal = new AbortController().signal;

    await expect(fetchProductDetail(PRODUCT_ID, signal)).resolves.toBeNull();
    await expect(fetchPriceHistory(PRODUCT_ID, 90, signal)).resolves.toBeNull();
  });
});
