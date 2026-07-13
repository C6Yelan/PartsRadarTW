// apps/crawler/src/coolpc/categories.ts
// 建立 CoolPC 目標分類共用資料：提供 parser 與手動驗證流程可用的 IGrp 對照、中文顯示名稱，並保留部分分類的頁面名稱預檢關鍵字。

export interface CoolpcTargetCategory {
  // IGrp：原價屋分類頁的 query 參數值，作為抓取目標定位鍵。
  igrp: number;
  // 類別原始名稱，通常對齊原價屋分類標題，供報表與手動工具辨識。
  sourceName: string;
  // 站內/後續 UI 顯示用名稱。
  displayName: string;
  // 可選：該分類頁常見有效頁面標題片段，用於內容驗證與誤抓擋位偵測。
  expectedTitleKeywords?: readonly string[];
}

// 目前為 parser 與 manual 驗證共同維護的目標分類清單；
// 缺失者會被視為「未抓取」而非「可預設支援」。
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
    sourceName: "固態 SSD",
    displayName: "SSD",
    expectedTitleKeywords: ["內接硬碟", "固態SSD", "HDD", "SSD"],
  },
  {
    igrp: 8,
    sourceName: "內接硬碟 HDD",
    displayName: "HDD",
    // CoolPC 的 IGrp=8 標題仍是舊外接分類名稱，但目前商品內容是內接 HDD。
    expectedTitleKeywords: ["外接硬碟", "隨身碟", "記憶卡"],
  },
  {
    igrp: 9,
    sourceName: "USB週邊 / 硬碟座 / 讀卡機",
    displayName: "外接儲存",
    expectedTitleKeywords: ["USB週邊", "硬碟座", "讀卡機"],
  },
  {
    igrp: 10,
    sourceName: "散熱器 / 散熱墊 / 散熱膏",
    displayName: "散熱器",
    expectedTitleKeywords: ["CPU散熱", "散熱墊", "散熱膏", "散熱"],
  },
  {
    igrp: 11,
    sourceName: "封閉式 / 開放式水冷",
    displayName: "水冷",
    expectedTitleKeywords: ["水冷", "封閉式", "開放式"],
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
  {
    igrp: 16,
    sourceName: "機殼風扇 / 機殼配件",
    displayName: "風扇 / 配件",
    expectedTitleKeywords: ["機殼風扇", "機殼配件", "風扇", "配件"],
  },
] as const satisfies readonly CoolpcTargetCategory[];
