import { describe, expect, it } from "vitest";
import { createPublicProductImagePath } from "./product-image-url";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

describe("product image shared helpers", () => {
  it("builds the public product image API path", () => {
    // The helper intentionally returns a relative path rather than baking in a deployment host.
    expect(createPublicProductImagePath(PRODUCT_ID.toUpperCase())).toBe(
      `/api/product-images/${PRODUCT_ID}.webp`,
    );
  });
});
