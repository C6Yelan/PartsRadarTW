// 驗證 web 共用整數、TWD 與 Asia/Taipei 顯示契約。

import { describe, expect, it } from "vitest";

import {
  formatInteger,
  formatSignedPercent,
  formatSignedTwdPrice,
  formatTwdPrice,
} from "../../app/_shared/formatting";
import {
  formatTaipeiDateTime,
  formatTaipeiMonthDay,
  formatTaipeiMonthDayTime,
} from "../../app/_shared/time";

describe("web formatting", () => {
  it("uses one integer and TWD spacing contract", () => {
    expect(formatInteger(12_345)).toBe("12,345");
    expect(formatTwdPrice(12_345)).toBe("NT$ 12,345");
    expect(formatSignedTwdPrice(1000)).toBe("+NT$ 1,000");
    expect(formatSignedTwdPrice(-1000)).toBe("−NT$ 1,000");
    expect(formatSignedTwdPrice(0)).toBe("NT$ 0");
  });

  it("uses explicit fallbacks for missing and invalid numbers", () => {
    expect(formatInteger(null)).toBe("—");
    expect(formatTwdPrice(Number.NaN)).toBe("—");
    expect(formatSignedTwdPrice(Number.POSITIVE_INFINITY, "資料不足")).toBe("資料不足");
    expect(formatSignedPercent(null)).toBe("—");
    expect(formatSignedPercent(Number.NaN, 1, "資料不足")).toBe("資料不足");
  });

  it("uses U+2212 for negative signed prices and percentages", () => {
    const negativePrice = formatSignedTwdPrice(-300);
    const negativePercent = formatSignedPercent(-4.8);

    expect(negativePrice).toBe("−NT$ 300");
    expect(negativePercent).toBe("−4.8%");
    expect(negativePrice.startsWith("−")).toBe(true);
    expect(negativePercent.startsWith("−")).toBe(true);
    expect(negativePrice.charCodeAt(0)).toBe(0x2212);
    expect(negativePercent.charCodeAt(0)).toBe(0x2212);
    expect(negativePrice.startsWith("-")).toBe(false);
    expect(negativePercent.startsWith("-")).toBe(false);

    expect(formatSignedTwdPrice(300)).toBe("+NT$ 300");
    expect(formatSignedPercent(4.8)).toBe("+4.8%");
    expect(formatSignedPercent(0)).toBe("0%");
    expect(formatSignedPercent(-0)).toBe("0%");
    expect(formatSignedPercent(0.01)).toBe("0%");
    expect(formatSignedPercent(-0.01)).toBe("0%");
  });

  it("formats all visible date shapes in Asia/Taipei across midnight", () => {
    const value = "2026-05-28T16:05:00.000Z";

    expect(formatTaipeiDateTime(value)).toBe("2026-05-29 00:05");
    expect(formatTaipeiMonthDay(value)).toBe("05/29");
    expect(formatTaipeiMonthDayTime(value)).toBe("05/29 00:05");
  });

  it("uses explicit fallbacks for missing and invalid dates", () => {
    expect(formatTaipeiDateTime(null)).toBe("—");
    expect(formatTaipeiDateTime("not-a-date", "尚無資料")).toBe("尚無資料");
    expect(formatTaipeiMonthDay(new Date(Number.NaN))).toBe("");
    expect(formatTaipeiMonthDayTime(undefined, "資料不足")).toBe("資料不足");
  });
});
