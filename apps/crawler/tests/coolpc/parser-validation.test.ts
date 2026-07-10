// apps/crawler/tests/coolpc/parser-validation.test.ts
// 驗證 CoolPC 分類頁內容檢核會正確區分有效頁、結構缺漏與疑似封鎖頁。

import { describe, expect, it } from "vitest";
import { validateCoolpcCategoryPage } from "../../src/coolpc/parser/content-validation";
import { context, fixture } from "./parser-support";

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
