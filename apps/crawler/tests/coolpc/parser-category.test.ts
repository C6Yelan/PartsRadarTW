// apps/crawler/tests/coolpc/parser-category.test.ts
// 驗證 CoolPC 分類頁 parser 會組裝商品欄位、parse issue、去重結果與可匯入狀態。

import { describe, expect, it } from "vitest";
import { parseCoolpcCategoryPage } from "../../src/coolpc/parser";
import { categoryHtml, context, contextForCategory, fixture } from "./parser-support";

describe("CoolPC category parser", () => {
  it("parses product token, name, price, source key, and sanitized source URL", () => {
    const result = parseCoolpcCategoryPage(fixture("cpu-category.normal.html"), context);

    expect(result.canImport).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      sourceCategoryId: context.sourceCategoryId,
      igrp: 4,
      sourceName: "處理器 CPU",
      displayName: "CPU",
      ibuyToken: "CPU-TOKEN-001",
      sourceItemKey: "coolpc:igrp:4:ibuy:CPU-TOKEN-001",
      name: "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G",
      normalizedName: "amd ryzen 5 7500f mpk【6核/12緒】3.7g",
      vendorSlug: "amd",
      vendorName: "AMD",
      primaryImageUrl: "https://www.coolpc.com.tw/eval/4/amd7500f.jpg",
      price: 4880,
      currency: "TWD",
      sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
      fetchedAt: context.fetchedAt,
    });
  });

  it("parses reduced live title variants for target storage and cooling categories", () => {
    const fixtures = [
      [7, "coolpc-live-igrp-7.sample.html"],
      [8, "coolpc-live-igrp-8.sample.html"],
      [10, "coolpc-live-igrp-10.sample.html"],
      [11, "coolpc-live-igrp-11.sample.html"],
      [16, "coolpc-live-igrp-16.sample.html"],
    ] as const;

    for (const [igrp, fixtureName] of fixtures) {
      const result = parseCoolpcCategoryPage(fixture(fixtureName), contextForCategory(igrp));

      expect(result.validation.status).toBe("valid");
      expect(result.canImport).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
    }
  });

  it("derives vendor metadata for HDD, water cooling, and fan categories", () => {
    const fixtures = [
      [
        8,
        "coolpc-live-igrp-8.sample.html",
        [
          { vendorSlug: "toshiba", vendorName: "Toshiba" },
          { vendorSlug: "toshiba", vendorName: "Toshiba" },
          { vendorSlug: "toshiba", vendorName: "Toshiba" },
        ],
      ],
      [
        11,
        "coolpc-live-igrp-11.sample.html",
        [
          { vendorSlug: "asus", vendorName: "華碩" },
          { vendorSlug: "asus", vendorName: "華碩" },
          { vendorSlug: "asus", vendorName: "華碩" },
        ],
      ],
      [
        16,
        "coolpc-live-igrp-16.sample.html",
        [
          { vendorSlug: "delta", vendorName: "台達" },
          { vendorSlug: "acer", vendorName: "宏碁" },
          { vendorSlug: "msi", vendorName: "微星" },
        ],
      ],
    ] as const;

    for (const [igrp, fixtureName, expectedVendors] of fixtures) {
      const result = parseCoolpcCategoryPage(fixture(fixtureName), contextForCategory(igrp));

      expect(
        result.items.map(({ vendorSlug, vendorName }) => ({ vendorSlug, vendorName })),
      ).toEqual(expectedVendors);
    }
  });

  it("skips explicit non-product rows without dropping standalone accessory products", () => {
    const result = parseCoolpcCategoryPage(
      fixture("coolpc-live-igrp-10-notice.html"),
      contextForCategory(10),
    );

    expect(result.validation.status).toBe("valid");
    expect(result.canImport).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.items.map((item) => item.name)).toEqual([
      "酷碼 HTK-002 美國道康膏/導熱係數 0.8W/m-K",
    ]);
  });

  it("skips motherboard promotions embedded in the CPU source category", () => {
    const html = fixture("cpu-category.normal.html").replace(
      "</section>",
      `<div class="item">
        <div class="w">CPU-BUNDLE-BOARD</div>
        <span>
          <img alt="" src="/eval/4/board.jpg">
          <div class="t">[搭CPU現省500] 技嘉 B860M GAMING X WIFI6E(M-ATX)</div>
          <div class="x">含稅：NT4990</div>
        </span>
      </div></section>`,
    );

    const result = parseCoolpcCategoryPage(html, context);

    expect(result.items.map((item) => item.name)).not.toContain(
      "[搭CPU現省500] 技嘉 B860M GAMING X WIFI6E(M-ATX)",
    );
    expect(result.excludedIbuyTokens).toEqual(["CPU-BUNDLE-BOARD"]);
    expect(result.items).toHaveLength(2);
  });

  it("deduplicates exact duplicate rows from reduced live case and power supply fixtures", () => {
    const fixtures = [
      [14, "coolpc-live-igrp-14-duplicate.html"],
      [15, "coolpc-live-igrp-15-duplicate.html"],
    ] as const;

    for (const [igrp, fixtureName] of fixtures) {
      const result = parseCoolpcCategoryPage(fixture(fixtureName), contextForCategory(igrp));

      expect(result.validation.status).toBe("valid");
      expect(result.canImport).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.deduplicatedItemCount).toBe(1);
      expect(result.issues).toEqual([]);
    }
  });

  it("keeps invalid product candidates out of parsed items and reports parse issues", () => {
    const result = parseCoolpcCategoryPage(
      fixture("cpu-category.mixed-invalid-items.html"),
      context,
    );

    expect(result.canImport).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.issues.map((issue) => issue.type)).toEqual([
      "missing_ibuy_token",
      "missing_name",
      "price_parse_failed",
    ]);
  });

  it("parses products with invalid image URLs and records nonfatal issues", () => {
    const result = parseCoolpcCategoryPage(fixture("cpu-category.invalid-image.html"), context);

    expect(result.canImport).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.primaryImageUrl).toBe("https://www.coolpc.com.tw/eval/4/amd7500f.jpg");
    expect(result.items[1]).toMatchObject({
      ibuyToken: "CPU-TOKEN-002",
      name: "Invalid image product",
      primaryImageUrl: null,
      price: 5990,
    });
    expect(result.items[2]).toMatchObject({
      ibuyToken: "CPU-TOKEN-003",
      name: "External image product",
      primaryImageUrl: null,
      price: 6990,
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        type: "invalid_image_url",
        rawToken: "CPU-TOKEN-002",
        rawImageUrl: "/eval/4/",
      }),
      expect.objectContaining({
        type: "invalid_image_url",
        rawToken: "CPU-TOKEN-003",
        rawImageUrl: "https://example.com/product.jpg",
      }),
    ]);
  });

  it("keeps source image directory placeholders nonfatal for live-like category rows", () => {
    const cases = [
      [14, "/eval/14/"],
      [15, "/eval/15/revolutioniiiwjpg"],
    ] as const;

    for (const [igrp, rawImageUrl] of cases) {
      const result = parseCoolpcCategoryPage(
        categoryHtml({
          igrp,
          rawImageUrl,
        }),
        contextForCategory(igrp),
      );

      expect(result.canImport).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        ibuyToken: `TOKEN-${igrp}`,
        primaryImageUrl: null,
        price: 4190,
      });
      expect(result.issues).toEqual([
        expect.objectContaining({
          type: "invalid_image_url",
          rawImageUrl,
          rawToken: `TOKEN-${igrp}`,
        }),
      ]);
    }
  });

  it("deduplicates same source identity, name, and price repeats in the same snapshot", () => {
    const result = parseCoolpcCategoryPage(fixture("cpu-category.duplicate-token.html"), context);

    expect(result.canImport).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.deduplicatedItemCount).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it("blocks import when duplicate source identity has conflicting product data", () => {
    const result = parseCoolpcCategoryPage(
      fixture("cpu-category.conflicting-duplicate-token.html"),
      context,
    );

    expect(result.canImport).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.issues).toEqual([
      expect.objectContaining({
        type: "duplicate_source_identity",
        sourceItemKey: "coolpc:igrp:4:ibuy:CPU-TOKEN-001",
      }),
    ]);
  });

  it("does not parse products when content validation fails", () => {
    const result = parseCoolpcCategoryPage(fixture("http-200.non-product.html"), context);

    expect(result.canImport).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        type: "content_validation_failed",
      }),
    ]);
  });
});
