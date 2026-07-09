// packages/shared/src/coolpc-source.test.ts
// 驗證 CoolPC 來源名稱、官方 origin、分類 / 購買 URL 與官方 base URL 判斷。

import { describe, expect, it } from "vitest";
import {
  COOLPC_OFFICIAL_BASE_URL,
  COOLPC_SOURCE_NAME,
  createCoolpcCategoryUrl,
  createCoolpcPurchaseUrl,
  isOfficialCoolpcBaseUrl,
} from "./coolpc-source";

describe("CoolPC source shared helpers", () => {
  it("keeps the source identity and official origin centralized", () => {
    expect(COOLPC_SOURCE_NAME).toBe("coolpc");
    expect(COOLPC_OFFICIAL_BASE_URL).toBe("https://www.coolpc.com.tw");
  });

  it("builds public CoolPC category and purchase URLs", () => {
    expect(createCoolpcCategoryUrl(4)).toBe("https://www.coolpc.com.tw/eachview.php?IGrp=4");
    expect(createCoolpcPurchaseUrl("CPU123")).toBe(
      "https://www.coolpc.com.tw/evaluate.php?iBuy=CPU123",
    );
  });

  it("recognizes the canonical official origin only", () => {
    expect(isOfficialCoolpcBaseUrl(new URL("https://www.coolpc.com.tw/"))).toBe(true);
    expect(isOfficialCoolpcBaseUrl(new URL("https://www.coolpc.com.tw/path"))).toBe(false);
    expect(isOfficialCoolpcBaseUrl(new URL("https://example.test/"))).toBe(false);
  });
});
