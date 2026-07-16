// apps/crawler/src/coolpc/categories.ts
// 建立 CoolPC 目標分類共用資料：提供 parser 與手動驗證流程可用的 IGrp 對照、中文顯示名稱，並保留部分分類的頁面名稱預檢關鍵字。

import {
  COOLPC_CATEGORY_IDENTITIES,
  type CoolpcCategoryIdentity,
} from "@partsradar/shared";

export interface CoolpcTargetCategory extends CoolpcCategoryIdentity {
  // 可選：該分類頁常見有效頁面標題片段，用於內容驗證與誤抓擋位偵測。
  readonly expectedTitleKeywords?: readonly string[];
}

// 目前為 parser 與 manual 驗證共同維護的目標分類清單；
// 缺失者會被視為「未抓取」而非「可預設支援」。
export const COOLPC_TARGET_CATEGORIES: readonly CoolpcTargetCategory[] =
  COOLPC_CATEGORY_IDENTITIES.map((identity) => {
    switch (identity.igrp) {
      case 7:
        return {
          ...identity,
          expectedTitleKeywords: ["內接硬碟", "固態SSD", "HDD", "SSD"] as const,
        };
      case 8:
        return {
          ...identity,
          // CoolPC 的 IGrp=8 標題仍是舊外接分類名稱，但目前商品內容是內接 HDD。
          expectedTitleKeywords: ["外接硬碟", "隨身碟", "記憶卡"] as const,
        };
      case 9:
        return {
          ...identity,
          expectedTitleKeywords: ["USB週邊", "硬碟座", "讀卡機"] as const,
        };
      case 10:
        return {
          ...identity,
          expectedTitleKeywords: ["CPU散熱", "散熱墊", "散熱膏", "散熱"] as const,
        };
      case 11:
        return {
          ...identity,
          expectedTitleKeywords: ["水冷", "封閉式", "開放式"] as const,
        };
      case 16:
        return {
          ...identity,
          expectedTitleKeywords: ["機殼風扇", "機殼配件", "風扇", "配件"] as const,
        };
      default:
        return identity;
    }
  });
