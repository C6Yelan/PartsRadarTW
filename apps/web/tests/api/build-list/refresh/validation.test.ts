// apps/web/tests/api/build-list/refresh/validation.test.ts
// 驗證配單 refresh request 的 content type、body bytes、UUID、去重與 50 筆上限。

import { describe, expect, it } from "vitest";

import {
  MAX_BUILD_LIST_REFRESH_BODY_BYTES,
  parseBuildListRefreshRequest,
} from "../../../../app/api/build-list/refresh/validation";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

describe("POST /api/build-list/refresh validation", () => {
  it("normalizes and deduplicates UUIDs while preserving first order", async () => {
    const request = jsonRequest([
      PRODUCT_ID.toUpperCase(),
      ` ${PRODUCT_ID} `,
      "22222222-2222-2222-2222-222222222222",
    ]);

    await expect(parseBuildListRefreshRequest(request)).resolves.toEqual([
      PRODUCT_ID,
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("accepts an empty array and exactly 50 raw IDs", async () => {
    await expect(parseBuildListRefreshRequest(jsonRequest([]))).resolves.toEqual([]);

    const fiftyIds = Array.from({ length: 50 }, (_, index) => productId(index));

    await expect(parseBuildListRefreshRequest(jsonRequest(fiftyIds))).resolves.toEqual(fiftyIds);
  });

  it("rejects a 51st raw item before deduplication", async () => {
    const repeatedIds = Array.from({ length: 51 }, () => PRODUCT_ID);

    await expect(parseBuildListRefreshRequest(jsonRequest(repeatedIds))).resolves.toBeNull();
  });

  it.each([
    { label: "malformed JSON", body: "{" },
    { label: "non-array body", body: JSON.stringify({ productIds: [PRODUCT_ID] }) },
    { label: "non-string value", body: JSON.stringify([123]) },
    { label: "invalid UUID", body: JSON.stringify(["not-a-uuid"]) },
    { label: "arbitrary URL", body: JSON.stringify(["https://example.com/product"]) },
  ])("rejects $label", async ({ body }) => {
    await expect(parseBuildListRefreshRequest(rawRequest(body))).resolves.toBeNull();
  });

  it("rejects query parameters and non-JSON content types", async () => {
    await expect(
      parseBuildListRefreshRequest(
        rawRequest(JSON.stringify([PRODUCT_ID]), {
          url: "https://partsradar.test/api/build-list/refresh?productId=other",
        }),
      ),
    ).resolves.toBeNull();
    await expect(
      parseBuildListRefreshRequest(
        rawRequest(JSON.stringify([PRODUCT_ID]), {
          contentType: "text/plain",
        }),
      ),
    ).resolves.toBeNull();
  });

  it("accepts JSON charset parameters and rejects bodies over 4 KiB", async () => {
    await expect(
      parseBuildListRefreshRequest(
        rawRequest(JSON.stringify([PRODUCT_ID]), {
          contentType: "application/json; charset=utf-8",
        }),
      ),
    ).resolves.toEqual([PRODUCT_ID]);

    const oversizedBody = `"${"x".repeat(MAX_BUILD_LIST_REFRESH_BODY_BYTES)}"`;

    await expect(parseBuildListRefreshRequest(rawRequest(oversizedBody))).resolves.toBeNull();
  });
});

function jsonRequest(value: unknown): Request {
  return rawRequest(JSON.stringify(value));
}

function rawRequest(
  body: string,
  options: {
    contentType?: string;
    url?: string;
  } = {},
): Request {
  return new Request(options.url ?? "https://partsradar.test/api/build-list/refresh", {
    method: "POST",
    headers: {
      "Content-Type": options.contentType ?? "application/json",
    },
    body,
  });
}

function productId(index: number): string {
  return `00000000-0000-0000-0000-${index.toString(16).padStart(12, "0")}`;
}
