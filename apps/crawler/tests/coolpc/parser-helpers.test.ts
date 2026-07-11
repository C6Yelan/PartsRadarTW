// apps/crawler/tests/coolpc/parser-helpers.test.ts
// 驗證 CoolPC parser 的分類範圍、價格解析與圖片 URL 正規化規則。

import { describe, expect, it } from "vitest";
import { COOLPC_TARGET_CATEGORIES } from "../../src/coolpc/categories";
import { parsePriceText } from "../../src/coolpc/parser/normalization";
import { normalizeCoolpcProductImageUrl } from "../../src/coolpc/parser/urls";

describe("CoolPC parser helpers", () => {
  it("keeps the current target categories in code", () => {
    expect(COOLPC_TARGET_CATEGORIES.map((category) => category.igrp)).toEqual([
      4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16,
    ]);
  });

  it("parses supported TWD price formats", () => {
    expect(parsePriceText("含稅：NT4880")).toBe(4880);
    expect(parsePriceText("含稅：NT4,880")).toBe(4880);
    expect(parsePriceText("現金價 $4880")).toBe(4880);
    expect(parsePriceText("現金價 $4,880")).toBe(4880);
    expect(parsePriceText("請來電詢價")).toBeNull();
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
