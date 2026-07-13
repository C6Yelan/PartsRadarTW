// apps/crawler/tests/coolpc/categories.test.ts
// 鎖定 crawler 實際抓取的 CoolPC IGrp 與 7/8/9 儲存分類契約。

import { describe, expect, it } from "vitest";
import { COOLPC_TARGET_CATEGORIES } from "../../src/coolpc/categories";

const EXPECTED_IGRPS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16];

describe("CoolPC target category contract", () => {
  it("keeps the exact target IGrp values", () => {
    expect(COOLPC_TARGET_CATEGORIES.map(({ igrp }) => igrp)).toEqual(EXPECTED_IGRPS);
  });

  it("keeps SSD, HDD, and external storage on their actual source IGrp values", () => {
    expect(COOLPC_TARGET_CATEGORIES.find(({ igrp }) => igrp === 7)).toMatchObject({
      sourceName: "固態 SSD",
      displayName: "SSD",
    });
    expect(COOLPC_TARGET_CATEGORIES.find(({ igrp }) => igrp === 8)).toMatchObject({
      sourceName: "內接硬碟 HDD",
      displayName: "HDD",
    });
    expect(COOLPC_TARGET_CATEGORIES.find(({ igrp }) => igrp === 9)).toMatchObject({
      sourceName: "USB週邊 / 硬碟座 / 讀卡機",
      displayName: "外接儲存",
    });
  });
});
