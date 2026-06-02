import { describe, expect, it } from "vitest";

import { toPublicIntroductionUrl } from "./public-introduction-url";

describe("public introduction URL helpers", () => {
  it("keeps public HTTP(S) introduction URLs and strips tracking/session state", () => {
    expect(
      toPublicIntroductionUrl(
        "https://example.com/products/gpu-review?utm_source=ad&PHPSESSID=secret&variant=black#reviews",
      ),
    ).toBe("https://example.com/products/gpu-review?variant=black");
  });

  it("omits unsafe or low-quality introduction URLs", () => {
    expect(toPublicIntroductionUrl("javascript:alert(1)")).toBeNull();
    expect(toPublicIntroductionUrl("https://user:secret@example.com/products/gpu-review")).toBeNull();
    expect(toPublicIntroductionUrl("https://shopee.tw/product/54133273/24027157445/")).toBeNull();
    expect(toPublicIntroductionUrl("https://example.com/products/gpu-driver-download")).toBeNull();
    expect(toPublicIntroductionUrl("https://example.com/spec.pdf")).toBeNull();
  });
});
