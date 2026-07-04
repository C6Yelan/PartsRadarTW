// apps/crawler/src/scripts/ops/smoke-discord-notification/state.ts

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { SmokeStatus } from "../production-smoke";

export const SMOKE_DISCORD_NOTIFICATION_STATE_VERSION = 1;

export type SmokeDiscordNotificationKind = "WARN" | "FAIL" | "RECOVERED";

export interface SmokeDiscordNotificationState {
  version: 1;
  lastObservedStatus: SmokeStatus;
  lastObservedAt: string;
  lastNotificationKind: SmokeDiscordNotificationKind | null;
  lastNotificationKey: string | null;
  lastNotificationAt: string | null;
}

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

function isSmokeStatus(value: unknown): value is SmokeStatus {
  return value === "OK" || value === "WARN" || value === "FAIL";
}

function isNullableNotificationKind(value: unknown): value is SmokeDiscordNotificationKind | null {
  return value === null || value === "WARN" || value === "FAIL" || value === "RECOVERED";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
