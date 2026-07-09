// apps/web/app/ops/status/types.ts
// 定義 /ops/status 頁面、健康檢查與 runtime schedule 使用的共用型別。

// ops status 檢查等級；頁面與彙總邏輯共用此三態。
export type OpsStatusLevel = "ok" | "warn" | "fail";

export type OpsStatusEnv = Record<string, string | undefined>;

// /ops/status 健康檢查使用的門檻集合，部分 env 與 production smoke 共用。
export interface OpsStatusThresholds {
  sourceWarnAfterMinutes: number;
  sourceFailAfterMinutes: number;
  crawlerWarnAfterMinutes: number;
  crawlerFailAfterMinutes: number;
  recentWindowHours: number;
  parseErrorWarnCount: number;
  parseErrorFailCount: number;
  invalidImageUrlWarnCount: number;
  minActiveProducts: number;
  missingImageWarnCount: number;
  missingImageFailCount: number;
  sourceBrokenLinkWarnCount: number;
  sourceBrokenLinkFailCount: number;
  sourceTemporaryLinkWarnCount: number;
  sourceTemporaryLinkFailCount: number;
  rawSnapshotNormalRetentionDays: number;
  rawSnapshotAbnormalRetentionDays: number;
  rawSnapshotRetentionGraceDays: number;
  rawSnapshotWarnCount: number;
  rawSnapshotFailCount: number;
}

// 狀態頁顯示的單一背景工作排程摘要。
export interface OpsStatusScheduleJob {
  key: string;
  label: string;
  cadence: string;
  details: string[];
}

// 狀態頁顯示的跨工作互斥或維運策略摘要。
export interface OpsStatusRuntimePolicy {
  key: string;
  label: string;
  detail: string;
}

// 狀態頁 runtime schedule 區塊的完整資料。
export interface OpsStatusRuntimeSchedule {
  jobs: OpsStatusScheduleJob[];
  policies: OpsStatusRuntimePolicy[];
}
