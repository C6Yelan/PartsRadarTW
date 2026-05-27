export interface CoolpcTargetCategory {
  igrp: number;
  sourceName: string;
  displayName: string;
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
    sourceName: "固態硬碟 M.2 / SSD",
    displayName: "SSD",
  },
  {
    igrp: 8,
    sourceName: "2.5 / 3.5 傳統內接硬碟 HDD",
    displayName: "HDD",
  },
  {
    igrp: 10,
    sourceName: "散熱器 / 散熱墊 / 散熱膏",
    displayName: "散熱器",
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
