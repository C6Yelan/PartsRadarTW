// apps/web/tests/products/product-share.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createProductShareUrl,
  formatProductShareStatus,
  shareProductUrl,
  toVisibleProductShareStatus,
} from "../../app/products/[id]/product-share";

describe("createProductShareUrl", () => {
  it("builds a canonical product URL without caller query state", () => {
    expect(createProductShareUrl("https://partsradar.test", "product-1")).toBe(
      "https://partsradar.test/products/product-1",
    );
    expect(
      createProductShareUrl(
        "https://partsradar.test/products/product-1?returnTo=%2F%3Figrp%3D7",
        "product-1",
      ),
    ).toBe("https://partsradar.test/products/product-1");
  });
});

describe("product share status", () => {
  it("only shows status text for clipboard fallback and real failures", () => {
    expect(toVisibleProductShareStatus("shared")).toBeNull();
    expect(toVisibleProductShareStatus("cancelled")).toBeNull();
    expect(toVisibleProductShareStatus("copied")).toBe("copied");
    expect(toVisibleProductShareStatus("failed")).toBe("failed");

    expect(formatProductShareStatus(null)).toBe("");
    expect(formatProductShareStatus("copied")).toBe("已複製連結");
    expect(formatProductShareStatus("failed")).toBe("目前無法分享");
  });
});

describe("shareProductUrl", () => {
  it("uses Web Share API when available", async () => {
    const share = vi.fn(async () => undefined);

    await expect(
      shareProductUrl({
        navigatorRef: { share },
        title: "GPU A",
        text: "GPU A - NT$ 10,000",
        url: "https://partsradar.test/products/product-1",
      }),
    ).resolves.toBe("shared");

    expect(share).toHaveBeenCalledWith({
      title: "GPU A",
      text: "GPU A - NT$ 10,000",
      url: "https://partsradar.test/products/product-1",
    });
  });

  it("falls back to clipboard when native sharing is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(
      shareProductUrl({
        navigatorRef: { clipboard: { writeText } },
        title: "GPU A",
        text: "GPU A - NT$ 10,000",
        url: "https://partsradar.test/products/product-1",
      }),
    ).resolves.toBe("copied");

    expect(writeText).toHaveBeenCalledWith("https://partsradar.test/products/product-1");
  });

  it("treats native share cancellation as a non-error result", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("Share cancelled", "AbortError");
    });

    await expect(
      shareProductUrl({
        navigatorRef: { share },
        title: "GPU A",
        text: "GPU A - NT$ 10,000",
        url: "https://partsradar.test/products/product-1",
      }),
    ).resolves.toBe("cancelled");
  });

  it("returns failed when no share path is available", async () => {
    await expect(
      shareProductUrl({
        navigatorRef: {},
        title: "GPU A",
        text: "GPU A - NT$ 10,000",
        url: "https://partsradar.test/products/product-1",
      }),
    ).resolves.toBe("failed");
  });
});
