export interface CoolpcTargetCategory {
  igrp: number;
  sourceName: string;
  displayName: string;
  expectedTitleKeywords?: readonly string[];
}

export const COOLPC_TARGET_CATEGORIES = [
  {
    igrp: 4,
    sourceName: "處理器 CPU",
    displayName: "CPU",
  },
  {
    igrp: 5,
    sourceName: "主機板 MB",
    displayName: "主機板",
  },
  {
    igrp: 6,
    sourceName: "記憶體 RAM",
    displayName: "記憶體",
  },
  {
    igrp: 7,
    sourceName: "內接硬碟 HDD / 固態 SSD",
    displayName: "SSD / HDD",
    expectedTitleKeywords: ["內接硬碟", "固態SSD", "HDD", "SSD"],
  },
  {
    igrp: 10,
    sourceName: "散熱器 / 散熱墊 / 散熱膏",
    displayName: "散熱器",
    expectedTitleKeywords: ["CPU散熱", "散熱墊", "散熱膏", "散熱"],
  },
  {
    igrp: 12,
    sourceName: "顯示卡 VGA",
    displayName: "顯示卡",
  },
  {
    igrp: 14,
    sourceName: "CASE 機殼",
    displayName: "機殼",
  },
  {
    igrp: 15,
    sourceName: "電源供應器",
    displayName: "電源供應器",
  },
] as const satisfies readonly CoolpcTargetCategory[];
