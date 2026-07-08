// apps/crawler/src/scripts/ops/smoke-discord-notification/state.ts
// 讀寫 production smoke Discord 告警的本機狀態檔，支援通知去重、冷卻與恢復判斷。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { SmokeStatus } from "../production-smoke";

export const SMOKE_DISCORD_NOTIFICATION_STATE_VERSION = 1;

export type SmokeDiscordNotificationKind = "WARN" | "FAIL" | "RECOVERED";

// Discord admin webhook 的持久化狀態；僅保存判斷下一輪是否需要通知所需的最小資訊。
export interface SmokeDiscordNotificationState {
  version: 1;
  lastObservedStatus: SmokeStatus;
  lastObservedAt: string;
  lastNotificationKind: SmokeDiscordNotificationKind | null;
  lastNotificationKey: string | null;
  lastNotificationAt: string | null;
}

// 讀取 smoke Discord 狀態檔；檔案尚未建立時視為沒有既有通知狀態。
export async function readSmokeDiscordNotificationState(
  path: string,
): Promise<SmokeDiscordNotificationState | null> {
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  return parseSmokeDiscordNotificationState(JSON.parse(raw));
}

// 以臨時檔加 rename 寫入狀態，降低 daemon 中斷時留下半套 JSON 的機率。
export async function writeSmokeDiscordNotificationState(
  path: string,
  state: SmokeDiscordNotificationState,
): Promise<void> {
  const directory = dirname(path);
  const tempPath = join(directory, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

// 驗證狀態檔 schema，避免壞檔案讓告警去重邏輯用到不可信資料。
function parseSmokeDiscordNotificationState(value: unknown): SmokeDiscordNotificationState {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid smoke Discord notification state file.");
  }

  const state = value as Partial<SmokeDiscordNotificationState>;

  if (
    state.version !== SMOKE_DISCORD_NOTIFICATION_STATE_VERSION ||
    !isSmokeStatus(state.lastObservedStatus) ||
    typeof state.lastObservedAt !== "string" ||
    !isNullableNotificationKind(state.lastNotificationKind) ||
    !isNullableString(state.lastNotificationKey) ||
    !isNullableString(state.lastNotificationAt)
  ) {
    throw new Error("Invalid smoke Discord notification state file.");
  }

  return {
    version: SMOKE_DISCORD_NOTIFICATION_STATE_VERSION,
    lastObservedStatus: state.lastObservedStatus,
    lastObservedAt: state.lastObservedAt,
    lastNotificationKind: state.lastNotificationKind,
    lastNotificationKey: state.lastNotificationKey,
    lastNotificationAt: state.lastNotificationAt,
  };
}

// 限定 production smoke 聚合狀態，避免 state file 混入非 smoke summary 的狀態字串。
function isSmokeStatus(value: unknown): value is SmokeStatus {
  return value === "OK" || value === "WARN" || value === "FAIL";
}

// 限定可被寫入 state file 的 Discord notification 類型。
function isNullableNotificationKind(value: unknown): value is SmokeDiscordNotificationKind | null {
  return value === null || value === "WARN" || value === "FAIL" || value === "RECOVERED";
}

// state file 的 nullable 字串欄位只接受 null 或 string，避免後續時間與 key 判斷誤用。
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

// 區分 Node.js 檔案系統錯誤，讓 ENOENT 可安全轉成「尚無狀態」。
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
