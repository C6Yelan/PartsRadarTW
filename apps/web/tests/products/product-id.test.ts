// 驗證 web runtime 共用 product UUID policy 的型別、格式與正規化邊界。

import { describe, expect, it } from "vitest";

import { normalizeProductId } from "../../app/_shared/product-id";

const PRODUCT_ID = "abcdef12-3456-789a-bcde-f0123456789a";

describe("normalizeProductId", () => {
  it.each([
    { label: "undefined", value: undefined },
    { label: "null", value: null },
    { label: "number", value: 123 },
    { label: "boolean", value: true },
    { label: "object", value: { productId: PRODUCT_ID } },
    { label: "array", value: [PRODUCT_ID] },
  ])("rejects the non-string value $label", ({ value }) => {
    expect(normalizeProductId(value)).toBeNull();
  });

  it.each([
    { label: "lowercase UUID", value: PRODUCT_ID },
    { label: "uppercase UUID", value: PRODUCT_ID.toUpperCase() },
    { label: "surrounding whitespace", value: ` \n\t${PRODUCT_ID.toUpperCase()} \r` },
  ])("normalizes a valid $label", ({ value }) => {
    expect(normalizeProductId(value)).toBe(PRODUCT_ID);
  });

  it.each([
    { label: "empty string", value: "" },
    { label: "whitespace", value: "  \n\t" },
    { label: "missing separators", value: "11111111222233334444555555555555" },
    { label: "partial UUID", value: "11111111-2222-3333-4444" },
    { label: "invalid hexadecimal", value: "g1111111-2222-3333-4444-555555555555" },
    { label: "wrapped UUID", value: `{${PRODUCT_ID}}` },
    { label: "prefixed UUID", value: `product-${PRODUCT_ID}` },
    { label: "absolute path", value: `/images/${PRODUCT_ID}` },
    { label: "traversal path", value: `../${PRODUCT_ID}` },
    { label: "slash suffix", value: `${PRODUCT_ID}/image` },
    { label: "query suffix", value: `${PRODUCT_ID}?image=1` },
    { label: "lowercase image suffix", value: `${PRODUCT_ID}.webp` },
    { label: "uppercase image suffix", value: `${PRODUCT_ID}.WEBP` },
    { label: "additional extension", value: `${PRODUCT_ID}.webp.png` },
    { label: "repeated image suffix", value: `${PRODUCT_ID}.webp.webp` },
  ])("rejects $label", ({ value }) => {
    expect(normalizeProductId(value)).toBeNull();
  });
});
