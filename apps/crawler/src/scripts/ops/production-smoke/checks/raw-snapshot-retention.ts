// apps/crawler/src/scripts/ops/production-smoke/checks/raw-snapshot-retention.ts
import { MILLISECONDS_PER_DAY } from "../constants";
import { thresholdCheck } from "../results";
import type { ProductionSmokeClient, ProductionSmokeOptions, SmokeCheckResult } from "../types";

export async function checkRawSnapshotRetention(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const normalCutoff = new Date(
    now.getTime() -
      (options.rawSnapshotNormalRetentionDays + options.rawSnapshotRetentionGraceDays) *
        MILLISECONDS_PER_DAY,
  );
  const abnormalCutoff = new Date(
    now.getTime() -
      (options.rawSnapshotAbnormalRetentionDays + options.rawSnapshotRetentionGraceDays) *
        MILLISECONDS_PER_DAY,
  );
  const expiredNormalCount = await client.rawSnapshot.count({
    where: {
      contentStatus: "VALID",
      createdAt: {
        lt: normalCutoff,
      },
    },
  });
  const expiredAbnormalCount = await client.rawSnapshot.count({
    where: {
      contentStatus: {
        in: ["SUSPECTED_BLOCK", "INVALID"],
      },
      createdAt: {
        lt: abnormalCutoff,
      },
    },
  });
  const expiredCount = expiredNormalCount + expiredAbnormalCount;
  const message = `expired=${expiredCount} normal=${expiredNormalCount} abnormal=${expiredAbnormalCount}`;

  return thresholdCheck(
    "raw snapshot retention",
    expiredCount,
    options.rawSnapshotWarnCount,
    options.rawSnapshotFailCount,
    message,
  );
}
