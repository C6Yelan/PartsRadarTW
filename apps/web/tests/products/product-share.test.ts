// apps/web/tests/products/product-share.test.ts
// 驗證商品 canonical URL、clipboard-only 複製與安全失敗提示。

import { describe, expect, it, vi } from "vitest";
import {
  createProductShareUrl,
  formatProductShareStatus,
  shareProductUrl,
} from "../../app/products/[id]/product-share";

describe("createProductShareUrl", () => {
  it("builds a canonical product URL without caller query state", () => {
    expect(createProductShareUrl("https://partsradar.test", "product-1")).toBe(
      "https://partsradar.test/products/product-1",
    );
    expect(
      createProductShareUrl(
        "https://partsradar.test/products/product-1?returnTo=%2F%3Fcategory%3Dstorage",
        "product-1",
      ),
    ).toBe("https://partsradar.test/products/product-1");
  });
});

describe("product share status", () => {
  it("shows concise clipboard success and actionable failure copy", () => {
    expect(formatProductShareStatus(null)).toBe("");
    expect(formatProductShareStatus("copied")).toBe("已複製到剪貼簿");
    expect(formatProductShareStatus("failed")).toBe("無法自動複製，請從瀏覽器網址列複製連結。");
  });
});

describe("shareProductUrl", () => {
  it("always copies the URL without calling Web Share", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    const navigatorRef = { clipboard: { writeText }, share };

    await expect(
      shareProductUrl({
        navigatorRef,
        url: "https://partsradar.test/products/product-1",
      }),
    ).resolves.toBe("copied");

    expect(writeText).toHaveBeenCalledWith("https://partsradar.test/products/product-1");
    expect(share).not.toHaveBeenCalled();
  });

  it("returns failed without falling back to Web Share when clipboard is missing", async () => {
    const share = vi.fn(async () => undefined);
    const navigatorRef = { clipboard: undefined, share };

    await expect(
      shareProductUrl({
        navigatorRef,
        url: "https://partsradar.test/products/product-1",
      }),
    ).resolves.toBe("failed");

    expect(share).not.toHaveBeenCalled();
  });

  it("returns failed without exposing a rejected clipboard error", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => {
      throw new Error("clipboard permission denied: private detail");
    });
    const navigatorRef = { clipboard: { writeText }, share };

    await expect(
      shareProductUrl({
        navigatorRef,
        url: "https://partsradar.test/products/product-1",
      }),
    ).resolves.toBe("failed");

    expect(writeText).toHaveBeenCalledOnce();
    expect(share).not.toHaveBeenCalled();
  });
});
