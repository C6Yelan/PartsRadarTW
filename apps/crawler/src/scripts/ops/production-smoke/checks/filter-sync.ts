// 檢查 CoolPC 篩選同步是否有可用且足夠新鮮的 last-known-good 狀態。

import { readCoolpcFilterSyncState } from "../../../../coolpc/filter-sync/state";
import { fail, formatAgeMinutes, minutesBetween, ok, warn } from "../results";
import type { SmokeCheckResult } from "../types";

const WARN_AFTER_MINUTES = 8 * 24 * 60;
const FAIL_AFTER_MINUTES = 14 * 24 * 60;

export async function checkCoolpcFilterSync(
  stateFilePath: string,
  now = new Date(),
): Promise<SmokeCheckResult> {
  try {
    const state = await readCoolpcFilterSyncState(stateFilePath);

    if (!state) {
      return warn("CoolPC filter sync", "state file is not available yet");
    }

    if (!state.lastSuccessAt) {
      return fail(
        "CoolPC filter sync",
        state.lastError
          ? `no accepted snapshot; lastError=${state.lastError}`
          : "no accepted snapshot",
      );
    }

    const ageMinutes = minutesBetween(new Date(state.lastSuccessAt), now);
    const details = [
      `lastSuccessAt=${formatAgeMinutes(ageMinutes)}`,
      `conditions=${state.conditionCount}`,
      `products=${state.productCount}`,
      `tagged=${state.taggedProductCount}`,
      `ambiguous=${state.ambiguousProductCount}`,
    ].join(" ");
    const joinCoverageFailures = Object.entries(state.joinCoverageFailures ?? {});

    if (joinCoverageFailures.length > 0) {
      const coverage = joinCoverageFailures
        .map(
          ([igrp, failure]) => `igrp=${igrp} matched=${failure.matchedCount}/${failure.totalCount}`,
        )
        .join(", ");
      return warn(
        "CoolPC filter sync",
        `${details} join coverage degraded: ${coverage}; refresh requested${state.lastError ? `; lastError=${state.lastError}` : ""}`,
      );
    }

    if (ageMinutes >= FAIL_AFTER_MINUTES) {
      return fail("CoolPC filter sync", details);
    }

    if (state.lastError) {
      return warn("CoolPC filter sync", `${details} lastError=${state.lastError}`);
    }

    if (ageMinutes >= WARN_AFTER_MINUTES) {
      return warn("CoolPC filter sync", details);
    }

    return ok("CoolPC filter sync", details);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("CoolPC filter sync", `state file is invalid: ${message}`);
  }
}
