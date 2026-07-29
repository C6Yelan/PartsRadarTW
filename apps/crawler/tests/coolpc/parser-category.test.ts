// apps/crawler/tests/coolpc/parser-category.test.ts
// 驗證 CoolPC 分類頁 parser 會組裝商品欄位、parse issue、去重結果與可匯入狀態。

import { MAX_PRODUCT_NAME_LENGTH } from "@partsradar/shared";
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
    expect(result.excludedProducts).toEqual([
      { ibuyToken: "CPU-BUNDLE-BOARD", reason: "misclassified_bundle_product" },
    ]);
    expect(result.items).toHaveLength(2);
  });

  it("excludes both exact conditional add-on prefixes from parsed products", () => {
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(5, [
        {
          token: "CONDITIONAL-ADD-ON-ASCII",
          name: '[加購優惠]買技嘉Z890主板"加購"美光 Crucial PRO 超頻32GB D5-5600',
        },
        {
          token: "CONDITIONAL-ADD-ON-CJK",
          name: "【加購優惠】買主機板加購 DDR5 32GB 記憶體",
        },
        {
          token: "REGULAR-MOTHERBOARD",
          name: "技嘉 Z890 AORUS ELITE WIFI7 主機板(ATX/DDR5)",
        },
      ]),
      contextForCategory(5),
    );

    expect(result.validation.status).toBe("valid");
    expect(result.canImport).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.excludedProducts).toEqual([
      { ibuyToken: "CONDITIONAL-ADD-ON-ASCII", reason: "conditional_add_on" },
      { ibuyToken: "CONDITIONAL-ADD-ON-CJK", reason: "conditional_add_on" },
    ]);
    expect(result.items.map((item) => item.ibuyToken)).toEqual(["REGULAR-MOTHERBOARD"]);
  });

  it("applies the conditional add-on exclusion to another IGrp", () => {
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(12, [
        { token: "GPU-ADD-ON", name: "[加購優惠]買主機板加購 RTX 5070" },
        { token: "REGULAR-GPU", name: "技嘉 RTX 5070 12GB 顯示卡" },
      ]),
      contextForCategory(12),
    );

    expect(result.canImport).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.excludedProducts).toEqual([
      { ibuyToken: "GPU-ADD-ON", reason: "conditional_add_on" },
    ]);
    expect(result.items.map((item) => item.ibuyToken)).toEqual(["REGULAR-GPU"]);
  });

  it.each([
    [12, "搭機優惠", "[搭機優惠] RTX 5070"],
    [12, "限搭機", "[限搭機] RTX 5070"],
    [6, "限任搭", "[限任搭] DDR5 32GB 記憶體"],
    [4, "任搭", "任搭主機板 AMD R7 9700X【8核/16緒】"],
    [14, "需搭配", "需搭配 SFX 電供的 ITX 機殼"],
    [14, "建議搭配", "建議搭配 SFX 電供 Fractal Design Ridge ITX 機殼"],
    [5, "中段加購優惠", "技嘉 Z890 主板 加購優惠 美光 DDR5 記憶體"],
  ])("keeps non-target conditional wording: %s", (igrp, token, name) => {
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(igrp, [{ token, name }]),
      contextForCategory(igrp),
    );

    expect(result.canImport).toBe(true);
    expect(result.excludedProducts).toEqual([]);
    expect(result.items.map((item) => item.ibuyToken)).toEqual([token]);
  });

  it("excludes bundle-only power supplies embedded in the case source category", () => {
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(14, [
        {
          token: "CASE-BUNDLE-PSU",
          name: "【限搭購喬思伯機殼】全漢 金鋼彈 650W 金牌 全模【SFX規格】",
        },
        {
          token: "CASE-BUNDLE-PSU-FEATURES",
          name: "[限搭購喬思伯機殼] 全漢 金鋼彈 金牌 全模【SFX規格】",
        },
        {
          token: "FRACTAL-RIDGE",
          name: "Fractal Design Ridge 黑 顯卡長33.5/CPU高7/ITX【SFX】",
        },
      ]),
      contextForCategory(14),
    );

    expect(result.validation.status).toBe("valid");
    expect(result.canImport).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.excludedProducts).toEqual([
      { ibuyToken: "CASE-BUNDLE-PSU", reason: "misclassified_bundle_product" },
      { ibuyToken: "CASE-BUNDLE-PSU-FEATURES", reason: "misclassified_bundle_product" },
    ]);
    expect(result.items.map((item) => item.ibuyToken)).toEqual(["FRACTAL-RIDGE"]);
    expect(result.items[0]?.filterTags).toContain("motherboard_support:mini-itx");
  });

  it.each([
    ["FRACTAL-TERRA", "Fractal Design Terra 黑 顯卡長32.2/CPU高7.7/ITX【SFX】"],
    ["REGULAR-SFX-CASE", "一般 ITX 機殼 支援 SFX 電源"],
    ["BUNDLE-WITHOUT-PSU", "【限搭購喬思伯機殼】喬思伯 Z20 M-ATX 機殼"],
    ["BUNDLE-SINGLE-PSU-SIGNAL", "[限搭購喬思伯機殼] 喬思伯 D31 支援 SFX 電源"],
  ])("keeps case products without the full exclusion signal: %s", (token, name) => {
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(14, [{ token, name }]),
      contextForCategory(14),
    );

    expect(result.canImport).toBe(true);
    expect(result.excludedProducts).toEqual([]);
    expect(result.items.map((item) => item.ibuyToken)).toEqual([token]);
  });

  it("does not apply the case-category exclusion rule to another IGrp", () => {
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(15, [
        {
          token: "PSU-CATEGORY-ITEM",
          name: "【限搭購喬思伯機殼】全漢 金鋼彈 650W 金牌 全模【SFX規格】",
        },
      ]),
      contextForCategory(15),
    );

    expect(result.canImport).toBe(true);
    expect(result.excludedProducts).toEqual([]);
    expect(result.items.map((item) => item.ibuyToken)).toEqual(["PSU-CATEGORY-ITEM"]);
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

  it.each([
    MAX_PRODUCT_NAME_LENGTH - 1,
    MAX_PRODUCT_NAME_LENGTH,
  ])("accepts a normalized product name at the %i-code-unit boundary", (length) => {
    const prefix = "AMD ";
    const name = `${prefix}${"X".repeat(length - prefix.length)}`;
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(4, [{ token: `BOUNDARY-${length}`, name }]),
      context,
    );

    expect(result.canImport).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe(name);
  });

  it("rejects a product name above the normalized boundary without retaining its payload", () => {
    const name = "X".repeat(MAX_PRODUCT_NAME_LENGTH + 1);
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(4, [{ token: "OVER-LIMIT", name }]),
      context,
    );

    expect(result.canImport).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.issues).toEqual([
      {
        type: "content_validation_failed",
        message: `Product candidate name exceeds ${MAX_PRODUCT_NAME_LENGTH} normalized code units.`,
      },
    ]);
    expect(JSON.stringify(result.issues)).not.toContain(name);
  });

  it("applies the boundary after whitespace normalization and NFKC expansion", () => {
    const whitespaceHeavyName = `AMD${" ".repeat(MAX_PRODUCT_NAME_LENGTH * 2)}R7 9700X`;
    const nfkcExpandingName = "㍿".repeat(Math.floor(MAX_PRODUCT_NAME_LENGTH / 4) + 1);
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(4, [
        { token: "WHITESPACE-NORMALIZED", name: whitespaceHeavyName },
        { token: "NFKC-OVER-LIMIT", name: nfkcExpandingName },
      ]),
      context,
    );

    expect(result.canImport).toBe(true);
    expect(result.items.map((item) => item.name)).toEqual(["AMD R7 9700X"]);
    expect(result.issues).toEqual([
      {
        type: "content_validation_failed",
        message: `Product candidate name exceeds ${MAX_PRODUCT_NAME_LENGTH} normalized code units.`,
      },
    ]);
  });

  it("rejects an overlong name before processing adjacent invalid price and image fields", () => {
    const name = `AMD ${"X".repeat(MAX_PRODUCT_NAME_LENGTH)}`;
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(4, [
        { token: "VALID-NEIGHBOR", name: "AMD R7 9700X" },
        {
          token: "OVER-LIMIT-INVALID-NEIGHBORS",
          name,
          rawPriceText: "not-a-price",
          rawImageUrl: "https://example.com/untrusted.jpg",
        },
      ]),
      context,
    );

    expect(result.canImport).toBe(true);
    expect(result.items.map((item) => item.ibuyToken)).toEqual(["VALID-NEIGHBOR"]);
    expect(result.issues).toEqual([
      {
        type: "content_validation_failed",
        message: `Product candidate name exceeds ${MAX_PRODUCT_NAME_LENGTH} normalized code units.`,
      },
    ]);
    expect(result.issues[0]).not.toHaveProperty("rawName");
    expect(result.issues[0]).not.toHaveProperty("rawPriceText");
    expect(result.issues[0]).not.toHaveProperty("rawImageUrl");
  });

  it("scans long case-bundle labels deterministically while preserving exclusion semantics", () => {
    const validBundleLabel = `【限搭購${"X".repeat(400)}機殼】`;
    const missingCaseTokenLabel = `【${"限搭購".repeat(120)}】`;
    const result = parseCoolpcCategoryPage(
      categoryProductsHtml(14, [
        {
          token: "LONG-BUNDLE-LABEL",
          name: `${validBundleLabel} 全漢 650W 金牌 全模`,
        },
        {
          token: "MISSING-CASE-TOKEN",
          name: `${missingCaseTokenLabel} 全漢 650W 金牌 全模`,
        },
      ]),
      contextForCategory(14),
    );

    expect(result.canImport).toBe(true);
    expect(result.excludedProducts).toEqual([
      { ibuyToken: "LONG-BUNDLE-LABEL", reason: "misclassified_bundle_product" },
    ]);
    expect(result.items.map((item) => item.ibuyToken)).toEqual(["MISSING-CASE-TOKEN"]);
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
      expect(result.issues).toEqual([]);
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

function categoryProductsHtml(
  igrp: number,
  products: readonly {
    token: string;
    name: string;
    rawPriceText?: string;
    rawImageUrl?: string;
  }[],
): string {
  const category = contextForCategory(igrp);
  const rows = products
    .map(
      ({ token, name, rawPriceText, rawImageUrl }) => `<div class="item">
        <div class="w">${token}</div>
        <span>
          <img alt="" src="${rawImageUrl ?? `/eval/${igrp}/product.jpg`}">
          <div class="t">${name}</div>
          <div class="x">${rawPriceText ?? "含稅：NT4,190"}</div>
        </span>
      </div>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="zh-Hant-TW">
  <head><title>原價屋${category.sourceName}總覽</title></head>
  <body><section class="category">${rows}</section></body>
</html>`;
}
