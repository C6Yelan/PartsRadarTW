// apps/crawler/tests/coolpc/categories.test.ts
// 鎖定 crawler 實際抓取的 CoolPC IGrp 與 7/8/9 儲存分類契約。

import { describe, expect, it } from "vitest";
import { COOLPC_TARGET_CATEGORIES } from "../../src/coolpc/categories";

describe("CoolPC target category contract", () => {
  it("keeps crawler-specific title keyword enrichment", () => {
    expect(
      COOLPC_TARGET_CATEGORIES.filter(({ expectedTitleKeywords }) => expectedTitleKeywords).map(
        ({ igrp, expectedTitleKeywords }) => ({ igrp, expectedTitleKeywords }),
      ),
    ).toEqual([
      { igrp: 7, expectedTitleKeywords: ["內接硬碟", "固態SSD", "HDD", "SSD"] },
      { igrp: 8, expectedTitleKeywords: ["外接硬碟", "隨身碟", "記憶卡"] },
      { igrp: 9, expectedTitleKeywords: ["USB週邊", "硬碟座", "讀卡機"] },
      { igrp: 10, expectedTitleKeywords: ["CPU散熱", "散熱墊", "散熱膏", "散熱"] },
      { igrp: 11, expectedTitleKeywords: ["水冷", "封閉式", "開放式"] },
      { igrp: 16, expectedTitleKeywords: ["機殼風扇", "機殼配件", "風扇", "配件"] },
    ]);
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
