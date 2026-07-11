// apps/crawler/tests/scripts/ops/discord-bot/commands/settings-input.test.ts
// 驗證個人與公開價格報告共用的分類選擇 parser 邊界。

import { describe, expect, it } from "vitest";
import { parsePriceReportCategorySelection } from "../../../../../src/scripts/ops/discord-bot/commands/settings-input";

const CATEGORIES = [{ igrp: 4 }, { igrp: 7 }, { igrp: 12 }];

describe("parsePriceReportCategorySelection", () => {
  it("deduplicates and sorts visible category values", () => {
    expect(parsePriceReportCategorySelection(["12", "4", "12"], CATEGORIES)).toEqual([4, 12]);
  });

  it("uses an empty filter when every visible category is selected", () => {
    expect(parsePriceReportCategorySelection(["12", "7", "4"], CATEGORIES)).toEqual([]);
  });

  it("rejects unknown and malformed category values", () => {
    expect(parsePriceReportCategorySelection(["99"], CATEGORIES)).toBeNull();
    expect(parsePriceReportCategorySelection(["4x"], CATEGORIES)).toBeNull();
  });
});
