// apps/crawler/tests/scripts/ops/discord-bot/message-text.test.ts
// 驗證 Discord 共用純 formatter 的 TWD、站內連結、單行文字、Markdown 與台北時間 contract。

import { describe, expect, it } from "vitest";
import {
  createProductUrl,
  escapeMarkdownLinkText,
  formatTaipeiMinute,
  formatTaiwanDollar,
  toSingleLine,
} from "../../../../src/scripts/ops/discord-bot/message-text";

describe("Discord shared message formatters", () => {
  it("formats product display values without feature-specific copy", () => {
    expect(createProductUrl("https://partsradar.test/base", "product-id")).toBe(
      "https://partsradar.test/products/product-id",
    );
    expect(formatTaiwanDollar(12_345)).toBe("NT$12,345");
    expect(toSingleLine("  RTX\n  5090\t顯示卡  ")).toBe("RTX 5090 顯示卡");
    expect(escapeMarkdownLinkText("GPU [A] \\ test")).toBe("GPU \\[A\\] \\\\ test");
    expect(formatTaipeiMinute(new Date("2026-06-06T16:00:00.000Z"))).toBe("06/07 00:00 GMT+8");
  });
});
