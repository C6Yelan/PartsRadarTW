// apps/web/app/ops/status/data/raw-snapshot-retention.ts

import type { OpsStatusReadClient } from "../client";
import type { OpsStatusThresholds } from "../types";

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

export interface OpsStatusRawSnapshotRetentionSummary {
  expired: number;
  expiredNormal: number;
  expiredAbnormal: number;
}

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
