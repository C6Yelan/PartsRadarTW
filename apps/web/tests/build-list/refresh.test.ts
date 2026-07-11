// apps/web/tests/build-list/refresh.test.ts
// 驗證配單 refresh client 的 success、partial missing、429、500、空配單與 malformed response。

import { describe, expect, it, vi } from "vitest";

import { refreshBuildListProducts } from "../../app/build-list/refresh";

const PRODUCT_ID_1 = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID_2 = "22222222-2222-2222-2222-222222222222";

describe("build list refresh client", () => {
  it("posts product IDs and accepts a complete response in request order", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        data: [snapshot(PRODUCT_ID_1), snapshot(PRODUCT_ID_2)],
        missingProductIds: [],
      }),
    );

    const result = await refreshBuildListProducts([PRODUCT_ID_1, PRODUCT_ID_2], { fetchImpl });

    expect(result).toMatchObject({
      status: "ready",
      missingProductIds: [],
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/build-list/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify([PRODUCT_ID_1, PRODUCT_ID_2]),
      signal: undefined,
    });
  });

  it("accepts partial and all-missing responses without fabricating snapshots", async () => {
    const partial = await refreshBuildListProducts([PRODUCT_ID_1, PRODUCT_ID_2], {
      fetchImpl: async () =>
        Response.json({
          data: [snapshot(PRODUCT_ID_2)],
          missingProductIds: [PRODUCT_ID_1],
        }),
    });
    const allMissing = await refreshBuildListProducts([PRODUCT_ID_1, PRODUCT_ID_2], {
      fetchImpl: async () =>
        Response.json({
          data: [],
          missingProductIds: [PRODUCT_ID_1, PRODUCT_ID_2],
        }),
    });

    expect(partial).toMatchObject({
      status: "ready",
      data: [{ id: PRODUCT_ID_2 }],
      missingProductIds: [PRODUCT_ID_1],
    });
    expect(allMissing).toEqual({
      status: "ready",
      data: [],
      missingProductIds: [PRODUCT_ID_1, PRODUCT_ID_2],
    });
  });

  it("returns distinct rate-limit and generic error states", async () => {
    await expect(
      refreshBuildListProducts([PRODUCT_ID_1], {
        fetchImpl: async () => new Response(null, { status: 429 }),
      }),
    ).resolves.toEqual({ status: "rate_limited" });
    await expect(
      refreshBuildListProducts([PRODUCT_ID_1], {
        fetchImpl: async () => new Response(null, { status: 500 }),
      }),
    ).resolves.toEqual({ status: "error" });
  });

  it("rejects malformed or incomplete success payloads", async () => {
    await expect(
      refreshBuildListProducts([PRODUCT_ID_1, PRODUCT_ID_2], {
        fetchImpl: async () =>
          Response.json({
            data: [snapshot(PRODUCT_ID_1)],
            missingProductIds: [],
          }),
      }),
    ).resolves.toEqual({ status: "error" });
    await expect(
      refreshBuildListProducts([PRODUCT_ID_1], {
        fetchImpl: async () =>
          Response.json({
            data: [{ ...snapshot(PRODUCT_ID_1), price: 1 }],
            missingProductIds: [],
          }),
      }),
    ).resolves.toEqual({ status: "error" });
  });

  it("does not issue a request for an empty build list", async () => {
    const fetchImpl = vi.fn(async () => Response.json({}));

    await expect(refreshBuildListProducts([], { fetchImpl })).resolves.toEqual({
      status: "ready",
      data: [],
      missingProductIds: [],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ignores an aborted request result", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      refreshBuildListProducts([PRODUCT_ID_1], {
        signal: controller.signal,
        fetchImpl: async () => {
          throw new Error("aborted");
        },
      }),
    ).resolves.toEqual({ status: "aborted" });
  });
});

function snapshot(productId: string) {
  return {
    id: productId,
    name: "GPU RTX 4070",
    image: {
      url: `/api/product-images/${productId}.webp`,
      alt: "GPU RTX 4070",
    },
    category: {
      displayName: "顯示卡",
    },
    price: {
      amount: 6990,
      currency: "TWD",
    },
    source: {
      url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
    },
    status: {
      isActive: true,
    },
    lastSeenAt: "2026-05-28T11:55:00.000Z",
  };
}
