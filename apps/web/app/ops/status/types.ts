// apps/web/app/ops/status/types.ts
export type OpsStatusLevel = "ok" | "warn" | "fail";

export type OpsStatusEnv = Record<string, string | undefined>;

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

export interface OpsStatusScheduleJob {
  key: string;
  label: string;
  cadence: string;
  details: string[];
}

export interface OpsStatusRuntimePolicy {
  key: string;
  label: string;
  detail: string;
}

export interface OpsStatusRuntimeSchedule {
  jobs: OpsStatusScheduleJob[];
  policies: OpsStatusRuntimePolicy[];
}
