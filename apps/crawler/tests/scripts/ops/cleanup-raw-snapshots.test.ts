import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatStorageDirForSummary,
  normalizeCleanupArgs,
  parseCleanupOptions,
  validateCleanupArgs,
} from "../../../src/scripts/ops/cleanup-raw-snapshots";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("raw snapshot cleanup CLI options", () => {
  it("defaults to dry-run unless --confirm-delete is provided", async () => {
    const workspaceRoot = await createTempRoot();

    expect(parseCleanupOptions([], workspaceRoot, {}).dryRun).toBe(true);
    expect(parseCleanupOptions(["--confirm-delete"], workspaceRoot, {}).dryRun).toBe(false);
  });

  it("rejects unknown flags and mistyped retention flags", async () => {
    expect(() => validateCleanupArgs(["--unknown"])).toThrow(
      "Unknown raw snapshot cleanup option: --unknown",
    );
    expect(() => validateCleanupArgs(["--normal-retention-day", "30"])).toThrow(
      "Unknown raw snapshot cleanup option: --normal-retention-day",
    );
  });

  it("rejects value flags without a value", async () => {
    expect(() => validateCleanupArgs(["--storage-dir"])).toThrow(
      "Missing value for --storage-dir.",
    );
    expect(() => validateCleanupArgs(["--storage-dir", "--confirm-delete"])).toThrow(
      "Missing value for --storage-dir.",
    );
  });

  it("ignores standalone pnpm argument separators before validation", async () => {
    const workspaceRoot = await createTempRoot();

    expect(normalizeCleanupArgs(["--", "--normal-retention-days", "1"])).toEqual([
      "--normal-retention-days",
      "1",
    ]);
    expect(
      parseCleanupOptions(
        ["--", "--normal-retention-days", "1", "--abnormal-retention-days", "1"],
        workspaceRoot,
        {},
      ),
    ).toMatchObject({
      normalRetentionDays: 1,
      abnormalRetentionDays: 1,
      dryRun: true,
    });
  });

  it("rejects unexpected positional arguments", async () => {
    expect(() => validateCleanupArgs(["--confirm-delete", "false"])).toThrow(
      "Unexpected raw snapshot cleanup argument: false",
    );
  });

  it("rejects unsafe storage dirs", async () => {
    const workspaceRoot = await createTempRoot();

    expect(() => parseCleanupOptions(["--storage-dir", ""], workspaceRoot, {})).toThrow(
      "value must not be empty",
    );
    expect(() => parseCleanupOptions(["--storage-dir", "/"], workspaceRoot, {})).toThrow(
      "filesystem root cannot be used",
    );
    expect(() => parseCleanupOptions(["--storage-dir", workspaceRoot], workspaceRoot, {})).toThrow(
      "workspace root cannot be used",
    );
  });

  it("allows Docker absolute paths and workspace-relative paths", async () => {
    const workspaceRoot = await createTempRoot();

    expect(
      parseCleanupOptions(["--storage-dir", "/var/lib/partsradar/snapshots"], workspaceRoot, {})
        .storageDir,
    ).toBe("/var/lib/partsradar/snapshots");
    expect(
      parseCleanupOptions(["--storage-dir", "temp/raw-snapshots"], workspaceRoot, {}).storageDir,
    ).toBe(join(workspaceRoot, "temp", "raw-snapshots"));
  });

  it("rejects invalid retention day values", async () => {
    const workspaceRoot = await createTempRoot();

    for (const value of ["0", "-1", "1.5", "abc"]) {
      expect(() =>
        parseCleanupOptions(["--normal-retention-days", value], workspaceRoot, {}),
      ).toThrow();
      expect(() =>
        parseCleanupOptions(["--abnormal-retention-days", value], workspaceRoot, {}),
      ).toThrow();
    }
  });

  it("formats workspace paths relatively and external paths absolutely", async () => {
    const workspaceRoot = await createTempRoot();

    expect(formatStorageDirForSummary(workspaceRoot, join(workspaceRoot, "temp", "raw"))).toBe(
      join("temp", "raw"),
    );
    expect(formatStorageDirForSummary(workspaceRoot, "/var/lib/partsradar/snapshots")).toBe(
      "/var/lib/partsradar/snapshots",
    );
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "partsradar-cleanup-cli-"));
  tempRoots.push(root);
  return root;
}
