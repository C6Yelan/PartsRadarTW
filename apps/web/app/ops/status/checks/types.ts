// apps/web/app/ops/status/checks/types.ts
// 定義 /ops/status 健康檢查結果列的共用資料結構。

import type { OpsStatusLevel } from "../types";

// 單一維運檢查項目的顯示資料，供狀態彙總與頁面表格共用。
export interface OpsStatusCheck {
  key: string;
  label: string;
  level: OpsStatusLevel;
  message: string;
}
