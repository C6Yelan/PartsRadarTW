// apps/crawler/src/scripts/ops/check-production-smoke-progress.ts
// 唯讀檢查 smoke state progress；不查 DB、不呼叫網站、不發 Discord，也不修改 state。

import {
  getStringArg,
  loadWorkspaceEnv,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../shared/script-utils";
import { evaluateSmokeProgressHealth } from "./production-smoke-daemon/health";
import { readSmokeDiscordNotificationState } from "./smoke-discord-notification";

const DEFAULT_STATE_FILE = "storage/ops/smoke-discord-state.json";
const DEFAULT_STALE_SECONDS = 900;
const MIN_STALE_SECONDS = 60;
const MAX_STALE_SECONDS = 24 * 60 * 60;

export async function checkProductionSmokeProgress({
  stateFilePath,
  staleThresholdSeconds,
  now = new Date(),
}: {
  stateFilePath: string;
  staleThresholdSeconds: number;
  now?: Date;
}): Promise<{ exitCode: 0 | 1; output: string }> {
  try {
    const state = await readSmokeDiscordNotificationState(stateFilePath);
    const result = evaluateSmokeProgressHealth({ state, now, staleThresholdSeconds });
    return {
      exitCode: result.healthy ? 0 : 1,
      output: `production-smoke health=${result.healthy ? "healthy" : "unhealthy"} reason=${result.reason} outcome=${result.outcome ?? "none"} lastCompletedAt=${result.lastCompletedAt ?? "none"}`,
    };
  } catch {
    return {
      exitCode: 1,
      output:
        "production-smoke health=unhealthy reason=state_invalid outcome=none lastCompletedAt=none",
    };
  }
}

async function main(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const args = process.argv.slice(2);
  const stateFilePath = resolveWorkspacePathArgument(
    workspaceRoot,
    getStringArg(args, "--state-file") ??
      process.env.SMOKE_DISCORD_STATE_FILE ??
      DEFAULT_STATE_FILE,
  );
  const staleThresholdSeconds = parseStaleThreshold(args, process.env);
  const result = await checkProductionSmokeProgress({ stateFilePath, staleThresholdSeconds });
  console.log(result.output);
  process.exitCode = result.exitCode;
}

function parseStaleThreshold(args: string[], env: NodeJS.ProcessEnv): number {
  const raw =
    getStringArg(args, "--stale-seconds") ??
    env.SMOKE_PROGRESS_STALE_SECONDS ??
    String(DEFAULT_STALE_SECONDS);
  const message = `--stale-seconds/SMOKE_PROGRESS_STALE_SECONDS must be an integer between ${MIN_STALE_SECONDS} and ${MAX_STALE_SECONDS}.`;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(message);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_STALE_SECONDS || value > MAX_STALE_SECONDS) {
    throw new Error(message);
  }
  return value;
}

if (require.main === module) {
  main().catch(() => {
    console.log(
      "production-smoke health=unhealthy reason=health_check_failed outcome=none lastCompletedAt=none",
    );
    process.exitCode = 1;
  });
}
