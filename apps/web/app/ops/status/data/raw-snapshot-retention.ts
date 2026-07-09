// apps/web/app/ops/status/data/raw-snapshot-retention.ts
// 收集 raw snapshot 是否超過保留期限的 /ops/status 摘要。

import type { OpsStatusReadClient } from "../client";
import type { OpsStatusThresholds } from "../types";

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

// raw snapshot retention 檢查的過期筆數摘要。
export interface OpsStatusRawSnapshotRetentionSummary {
  expired: number;
  expiredNormal: number;
  expiredAbnormal: number;
}

// 依正常與異常 snapshot 保留天數門檻，計算目前已過期的 metadata 筆數。
export async function collectRawSnapshotRetention(
  client: OpsStatusReadClient,
  thresholds: OpsStatusThresholds,
  now: Date,
): Promise<OpsStatusRawSnapshotRetentionSummary> {
  const normalCutoff = new Date(
    now.getTime() -
      (thresholds.rawSnapshotNormalRetentionDays + thresholds.rawSnapshotRetentionGraceDays) *
        MILLISECONDS_PER_DAY,
  );
  const abnormalCutoff = new Date(
    now.getTime() -
      (thresholds.rawSnapshotAbnormalRetentionDays + thresholds.rawSnapshotRetentionGraceDays) *
        MILLISECONDS_PER_DAY,
  );
  const [expiredNormal, expiredAbnormal] = await Promise.all([
    client.rawSnapshot.count({
      where: {
        contentStatus: "VALID",
        createdAt: {
          lt: normalCutoff,
        },
      },
    }),
    client.rawSnapshot.count({
      where: {
        contentStatus: {
          in: ["SUSPECTED_BLOCK", "INVALID"],
        },
        createdAt: {
          lt: abnormalCutoff,
        },
      },
    }),
  ]);

  return {
    expired: expiredNormal + expiredAbnormal,
    expiredNormal,
    expiredAbnormal,
  };
}
