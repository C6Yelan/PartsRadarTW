// apps/crawler/tests/coolpc/categories.test.ts
// 鎖定 crawler 實際抓取的 11 個 CoolPC IGrp，避免誤加不存在的 IGrp 9 或改動既有 7/8 分類。

import { describe, expect, it } from "vitest";
import { COOLPC_TARGET_CATEGORIES } from "../../src/coolpc/categories";

const EXPECTED_IGRPS = [4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16];

describe("CoolPC target category contract", () => {
  it("keeps the exact 11 target IGrp values", () => {
    expect(COOLPC_TARGET_CATEGORIES.map(({ igrp }) => igrp)).toEqual(EXPECTED_IGRPS);
  });

  it("keeps storage mappings on IGrp 7 and 8 while excluding IGrp 9", () => {
    expect(COOLPC_TARGET_CATEGORIES.find(({ igrp }) => igrp === 7)).toMatchObject({
      sourceName: "內接硬碟 HDD / 固態 SSD",
      displayName: "SSD / HDD",
    });
    expect(COOLPC_TARGET_CATEGORIES.find(({ igrp }) => igrp === 8)).toMatchObject({
      sourceName: "外接硬碟 / 隨身碟 / 記憶卡",
      displayName: "外接儲存",
    });
    const actualIgrps: readonly number[] = COOLPC_TARGET_CATEGORIES.map(({ igrp }) => igrp);
    expect(actualIgrps).not.toContain(9);
  });
});
