// 驗證 production smoke 對 CoolPC 篩選同步狀態的健康度判斷。

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COOLPC_FILTER_SYNC_STATE_VERSION,
  writeCoolpcFilterSyncState,
} from "../../../../src/coolpc/filter-sync/state";
import { checkCoolpcFilterSync } from "../../../../src/scripts/ops/production-smoke/checks/filter-sync";
import { createWorkspace } from "./production-smoke-workspace-support";

const NOW = new Date("2026-07-13T08:00:00.000Z");

describe("production smoke CoolPC filter sync check", () => {
  it("warns before the first sync has created state", async () => {
    const { workspaceRoot } = await createWorkspace();

    await expect(
      checkCoolpcFilterSync(join(workspaceRoot, "missing-state.json"), NOW),
    ).resolves.toMatchObject({ status: "WARN" });
  });

  it("reports a recent accepted snapshot as healthy", async () => {
    const { workspaceRoot } = await createWorkspace();
    const statePath = join(workspaceRoot, "filter-state.json");
    await writeCoolpcFilterSyncState(statePath, {
      version: COOLPC_FILTER_SYNC_STATE_VERSION,
      lastAttemptAt: "2026-07-13T07:00:00.000Z",
      lastSuccessAt: "2026-07-13T07:00:00.000Z",
      lastError: null,
      sourceHash: "hash",
      conditionCount: 63,
      productCount: 2277,
      taggedProductCount: 2200,
      ambiguousProductCount: 7,
      tagsByIgrp: {},
    });

    await expect(checkCoolpcFilterSync(statePath, NOW)).resolves.toMatchObject({
      status: "OK",
      message: expect.stringContaining("products=2277"),
    });
  });

  it("warns on a failed refresh while the accepted snapshot remains fresh", async () => {
    const { workspaceRoot } = await createWorkspace();
    const statePath = join(workspaceRoot, "filter-state.json");
    await writeCoolpcFilterSyncState(statePath, {
      version: COOLPC_FILTER_SYNC_STATE_VERSION,
      lastAttemptAt: "2026-07-13T07:30:00.000Z",
      lastSuccessAt: "2026-07-13T07:00:00.000Z",
      lastError: "HTTP 503",
      sourceHash: "hash",
      conditionCount: 63,
      productCount: 2277,
      taggedProductCount: 2200,
      ambiguousProductCount: 7,
      tagsByIgrp: {},
    });

    await expect(checkCoolpcFilterSync(statePath, NOW)).resolves.toMatchObject({
      status: "WARN",
      message: expect.stringContaining("lastError=HTTP 503"),
    });
  });

  it("fails when the accepted snapshot is older than two weeks", async () => {
    const { workspaceRoot } = await createWorkspace();
    const statePath = join(workspaceRoot, "filter-state.json");
    await writeCoolpcFilterSyncState(statePath, {
      version: COOLPC_FILTER_SYNC_STATE_VERSION,
      lastAttemptAt: "2026-06-28T08:00:00.000Z",
      lastSuccessAt: "2026-06-28T08:00:00.000Z",
      lastError: null,
      sourceHash: "hash",
      conditionCount: 63,
      productCount: 2277,
      taggedProductCount: 2200,
      ambiguousProductCount: 7,
      tagsByIgrp: {},
    });

    await expect(checkCoolpcFilterSync(statePath, NOW)).resolves.toMatchObject({ status: "FAIL" });
  });
});
