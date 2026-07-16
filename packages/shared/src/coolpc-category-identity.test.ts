// packages/shared/src/coolpc-category-identity.test.ts
// 驗證 CoolPC 分類共用 identity 的完整順序與 IGrp 唯一性。

import { describe, expect, it } from "vitest";
import { COOLPC_CATEGORY_IDENTITIES } from "./coolpc-category-identity";

describe("CoolPC category identities", () => {
  it("keeps the exact ordered identity tuples", () => {
    expect(COOLPC_CATEGORY_IDENTITIES).toEqual([
      { igrp: 4, sourceName: "處理器 CPU", displayName: "CPU" },
      { igrp: 5, sourceName: "主機板 MB", displayName: "主機板" },
      { igrp: 6, sourceName: "記憶體 RAM", displayName: "記憶體" },
      { igrp: 7, sourceName: "固態 SSD", displayName: "SSD" },
      { igrp: 8, sourceName: "內接硬碟 HDD", displayName: "HDD" },
      {
        igrp: 9,
        sourceName: "USB週邊 / 硬碟座 / 讀卡機",
        displayName: "外接儲存",
      },
      {
        igrp: 10,
        sourceName: "散熱器 / 散熱墊 / 散熱膏",
        displayName: "散熱器",
      },
      { igrp: 11, sourceName: "封閉式 / 開放式水冷", displayName: "水冷" },
      { igrp: 12, sourceName: "顯示卡 VGA", displayName: "顯示卡" },
      { igrp: 14, sourceName: "CASE 機殼", displayName: "機殼" },
      { igrp: 15, sourceName: "電源供應器", displayName: "電源供應器" },
      {
        igrp: 16,
        sourceName: "機殼風扇 / 機殼配件",
        displayName: "風扇 / 配件",
      },
    ]);
  });

  it("keeps every IGrp unique", () => {
    const igrps = COOLPC_CATEGORY_IDENTITIES.map(({ igrp }) => igrp);

    expect(new Set(igrps).size).toBe(igrps.length);
  });
});
