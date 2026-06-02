import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COOLPC_TARGET_CATEGORIES, type CoolpcTargetCategory } from "../../src/coolpc/categories";
import {
  createCoolpcCategoryUrl,
  createSourceItemKey,
  normalizeCoolpcIntroductionUrl,
  normalizeCoolpcProductImageUrl,
  parseCoolpcCategoryPage,
  parsePriceText,
  validateCoolpcCategoryPage,
  type SourceCategoryContext,
} from "../../src/coolpc/parser";

const fixtureDir = join(__dirname, "fixtures");

const context: SourceCategoryContext = {
  sourceCategoryId: "00000000-0000-0000-0000-000000000004",
  igrp: 4,
  sourceName: "處理器 CPU",
  displayName: "CPU",
  fetchedAt: new Date("2026-05-27T06:00:00.000Z"),
  sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=4&PHPSESSID=local-session",
};

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf8");
}

function contextForCategory(igrp: number): SourceCategoryContext {
  const category: CoolpcTargetCategory | undefined = COOLPC_TARGET_CATEGORIES.find(
    (candidate) => candidate.igrp === igrp,
  );

  if (!category) {
    throw new Error(`Missing test category for IGrp=${igrp}`);
  }

  return {
    sourceCategoryId: `test-coolpc-igrp-${category.igrp}`,
    igrp: category.igrp,
    sourceName: category.sourceName,
    displayName: category.displayName,
    fetchedAt: context.fetchedAt,
    sourceUrl: createCoolpcCategoryUrl(category.igrp),
    expectedTitleKeywords: category.expectedTitleKeywords
      ? [...category.expectedTitleKeywords]
      : undefined,
  };
}

describe("CoolPC parser helpers", () => {
  it("keeps the first-version target categories in code", () => {
    expect(COOLPC_TARGET_CATEGORIES.map((category) => category.igrp)).toEqual([
      4, 5, 6, 7, 10, 12, 14, 15,
    ]);
  });

  it("parses supported TWD price formats", () => {
    expect(parsePriceText("含稅：NT4880")).toBe(4880);
    expect(parsePriceText("含稅：NT4,880")).toBe(4880);
    expect(parsePriceText("現金價 $4880")).toBe(4880);
    expect(parsePriceText("現金價 $4,880")).toBe(4880);
    expect(parsePriceText("請來電詢價")).toBeNull();
  });

  it("creates source item keys without persisting them", () => {
    expect(createSourceItemKey(4, "CPU123")).toBe("coolpc:igrp:4:ibuy:CPU123");
  });

  it("creates category URLs without PHP session state", () => {
    expect(createCoolpcCategoryUrl(4)).toBe("https://www.coolpc.com.tw/eachview.php?IGrp=4");
  });

  it("normalizes only expected CoolPC product image URLs", () => {
    expect(normalizeCoolpcProductImageUrl("/eval/4/amd7500f.jpg", 4)).toBe(
      "https://www.coolpc.com.tw/eval/4/amd7500f.jpg",
    );
    expect(normalizeCoolpcProductImageUrl("http://www.coolpc.com.tw/eval/4/amd7500f.jpg", 4)).toBe(
      "https://www.coolpc.com.tw/eval/4/amd7500f.jpg",
    );
    expect(normalizeCoolpcProductImageUrl("/eval/4/", 4)).toBeNull();
    expect(normalizeCoolpcProductImageUrl("/eval/4/amd7500fjpg", 4)).toBeNull();
    expect(normalizeCoolpcProductImageUrl("/eval/5/amd7500f.jpg", 4)).toBeNull();
    expect(normalizeCoolpcProductImageUrl("https://example.com/eval/4/amd7500f.jpg", 4)).toBeNull();
    expect(normalizeCoolpcProductImageUrl("javascript:alert(1)", 4)).toBeNull();
  });

  it("normalizes only HTTP(S) introduction URLs", () => {
    expect(normalizeCoolpcIntroductionUrl("https://www.amd.com/zh-tw/products/7500f")).toBe(
      "https://www.amd.com/zh-tw/products/7500f",
    );
    expect(normalizeCoolpcIntroductionUrl("/article/product-intro.html")).toBe(
      "https://www.coolpc.com.tw/article/product-intro.html",
    );
    expect(normalizeCoolpcIntroductionUrl("")).toBeNull();
    expect(normalizeCoolpcIntroductionUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeCoolpcIntroductionUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects non-positive or non-integer CoolPC image category ids", () => {
    expect(normalizeCoolpcProductImageUrl("/eval/4/amd7500f.jpg", 0)).toBeNull();
    expect(normalizeCoolpcProductImageUrl("/eval/4/amd7500f.jpg", -1)).toBeNull();
    expect(normalizeCoolpcProductImageUrl("/eval/4/amd7500f.jpg", 4.5)).toBeNull();
    expect(normalizeCoolpcProductImageUrl("/eval/4/amd7500f.jpg", Number.NaN)).toBeNull();
    expect(
      normalizeCoolpcProductImageUrl("/eval/4/amd7500f.jpg", Number.POSITIVE_INFINITY),
    ).toBeNull();
    expect(normalizeCoolpcProductImageUrl("/eval/4/amd7500f.jpg", 4)).toBe(
      "https://www.coolpc.com.tw/eval/4/amd7500f.jpg",
    );
  });
});

describe("CoolPC response content validation", () => {
  it("accepts a normal category fixture", () => {
    const result = validateCoolpcCategoryPage(fixture("cpu-category.normal.html"), context);

    expect(result.status).toBe("valid");
    expect(result.hasExpectedTitle).toBe(true);
    expect(result.tokenCount).toBe(2);
    expect(result.validCandidateCount).toBe(2);
  });

  it("rejects category-like content missing token structure", () => {
    const result = validateCoolpcCategoryPage(fixture("cpu-category.missing-token.html"), context);

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("missing_required_product_structure");
  });

  it("rejects category-like content missing name structure", () => {
    const result = validateCoolpcCategoryPage(fixture("cpu-category.missing-name.html"), context);

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("missing_required_product_structure");
  });

  it("rejects category-like content with no parseable prices", () => {
    const result = validateCoolpcCategoryPage(fixture("cpu-category.missing-price.html"), context);

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("no_valid_product_candidates");
  });

  it("marks HTTP 200 non-product content as suspected block", () => {
    const result = validateCoolpcCategoryPage(fixture("http-200.non-product.html"), context);

    expect(result.status).toBe("suspected_block");
    expect(result.reason).toBe("not_expected_category_page");
  });
});

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
      introductionUrl:
        "https://www.amd.com/zh-tw/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7500f.html",
      price: 4880,
      currency: "TWD",
      sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
      fetchedAt: context.fetchedAt,
    });
  });

  it("parses reduced live title variants for target storage and cooler categories", () => {
    const fixtures = [
      [7, "coolpc-live-igrp-7.sample.html"],
      [10, "coolpc-live-igrp-10.sample.html"],
    ] as const;

    for (const [igrp, fixtureName] of fixtures) {
      const result = parseCoolpcCategoryPage(fixture(fixtureName), contextForCategory(igrp));

      expect(result.validation.status).toBe("valid");
      expect(result.canImport).toBe(true);
      expect(result.items).toHaveLength(1);
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

  it("keeps invalid image URL candidates out of parsed items", () => {
    const result = parseCoolpcCategoryPage(fixture("cpu-category.invalid-image.html"), context);

    expect(result.canImport).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.primaryImageUrl).toBe("https://www.coolpc.com.tw/eval/4/amd7500f.jpg");
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
