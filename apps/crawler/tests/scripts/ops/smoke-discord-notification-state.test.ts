import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readSmokeDiscordNotificationState,
  writeSmokeDiscordNotificationState,
} from "../../../src/scripts/ops/smoke-discord-notification";
import { createWorkspace, state } from "./smoke-discord-notification-support";

describe("smoke Discord notification state file", () => {
  it("returns null when the state file does not exist", async () => {
    const workspaceRoot = await createWorkspace();

    await expect(
      readSmokeDiscordNotificationState(join(workspaceRoot, "missing.json")),
    ).resolves.toBeNull();
  });

  it("writes and reads state files", async () => {
    const workspaceRoot = await createWorkspace();
    const path = join(workspaceRoot, "storage", "ops", "state.json");
    const expectedState = state({
      status: "FAIL",
      lastNotificationKind: "FAIL",
      lastNotificationKey: "FAIL:FAIL:crawler freshness",
      lastNotificationAt: "2026-06-06T12:00:00.000Z",
    });

    await writeSmokeDiscordNotificationState(path, expectedState);

    await expect(readSmokeDiscordNotificationState(path)).resolves.toEqual(expectedState);
  });

  it("rejects invalid state files", async () => {
    const workspaceRoot = await createWorkspace();
    const path = join(workspaceRoot, "storage", "ops", "state.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ version: 999 }), "utf8");

    await expect(readSmokeDiscordNotificationState(path)).rejects.toThrow(
      "Invalid smoke Discord notification state file.",
    );
  });
});
