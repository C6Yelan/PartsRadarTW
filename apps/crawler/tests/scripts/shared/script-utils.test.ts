// apps/crawler/tests/scripts/shared/script-utils.test.ts
// 驗證 crawler script 共用工具的 env 載入、CLI 整數解析、workspace 路徑解析與錯誤遮蔽。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getNumberArg,
  getPositiveNumberArg,
  loadWorkspaceEnv,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../../../src/scripts/shared/script-utils";

const TEST_ENV_KEYS = [
  "NODE_ENV",
  "PARTSRADAR_SCRIPT_UTILS_VALUE",
  "PARTSRADAR_SCRIPT_UTILS_EXISTING",
  "PARTSRADAR_SCRIPT_UTILS_LOCAL_ONLY",
] as const;

const originalEnv = new Map<string, string | undefined>();
const tempRoots: string[] = [];

beforeEach(() => {
  for (const key of TEST_ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of TEST_ENV_KEYS) {
    const value = originalEnv.get(key);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  originalEnv.clear();

  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("script utils", () => {
  it("does not load .env.local or override existing env values in production", async () => {
    const workspaceRoot = await createWorkspace({
      ".env": [
        "PARTSRADAR_SCRIPT_UTILS_VALUE=from_env",
        "PARTSRADAR_SCRIPT_UTILS_EXISTING=from_env",
      ].join("\n"),
      ".env.local": [
        "PARTSRADAR_SCRIPT_UTILS_VALUE=from_local",
        "PARTSRADAR_SCRIPT_UTILS_LOCAL_ONLY=from_local",
      ].join("\n"),
    });

    process.env.NODE_ENV = "production";
    process.env.PARTSRADAR_SCRIPT_UTILS_EXISTING = "from_process";

    await loadWorkspaceEnv(workspaceRoot);

    expect(process.env.PARTSRADAR_SCRIPT_UTILS_VALUE).toBe("from_env");
    expect(process.env.PARTSRADAR_SCRIPT_UTILS_EXISTING).toBe("from_process");
    expect(process.env.PARTSRADAR_SCRIPT_UTILS_LOCAL_ONLY).toBeUndefined();
  });

  it("keeps .env.local override behavior in development", async () => {
    const workspaceRoot = await createWorkspace({
      ".env": [
        "PARTSRADAR_SCRIPT_UTILS_VALUE=from_env",
        "PARTSRADAR_SCRIPT_UTILS_EXISTING=from_env",
      ].join("\n"),
      ".env.local": [
        "PARTSRADAR_SCRIPT_UTILS_VALUE=from_local",
        "PARTSRADAR_SCRIPT_UTILS_EXISTING=from_local",
        "PARTSRADAR_SCRIPT_UTILS_LOCAL_ONLY=from_local",
      ].join("\n"),
    });

    process.env.NODE_ENV = "development";
    process.env.PARTSRADAR_SCRIPT_UTILS_EXISTING = "from_process";

    await loadWorkspaceEnv(workspaceRoot);

    expect(process.env.PARTSRADAR_SCRIPT_UTILS_VALUE).toBe("from_local");
    expect(process.env.PARTSRADAR_SCRIPT_UTILS_EXISTING).toBe("from_local");
    expect(process.env.PARTSRADAR_SCRIPT_UTILS_LOCAL_ONLY).toBe("from_local");
  });

  it("throws on invalid env keys", async () => {
    const workspaceRoot = await createWorkspace({
      ".env": "BAD-KEY=value",
    });

    await expect(loadWorkspaceEnv(workspaceRoot)).rejects.toThrow('Invalid env key "BAD-KEY"');
  });

  it("strictly parses non-negative integer CLI args", () => {
    expect(getNumberArg(["--limit", "0"], "--limit", 10)).toBe(0);
    expect(getNumberArg(["--limit", "5000"], "--limit", 10)).toBe(5000);
    expect(getNumberArg([], "--limit", 10)).toBe(10);

    for (const value of ["123abc", "5000ms", "1.5", "-1", "", "9007199254740992"]) {
      expect(() => getNumberArg(["--limit", value], "--limit", 10)).toThrow();
    }
  });

  it("strictly parses optional positive integer CLI args", () => {
    expect(getPositiveNumberArg(["--limit", "1"], "--limit")).toBe(1);
    expect(getPositiveNumberArg(["--limit", "5000"], "--limit")).toBe(5000);
    expect(getPositiveNumberArg([], "--limit")).toBeNull();

    for (const value of ["0", "123abc", "1.5", "-1", "", "9007199254740992"]) {
      expect(() => getPositiveNumberArg(["--limit", value], "--limit")).toThrow();
    }
  });

  it("finds the workspace root from nested cwd values", async () => {
    const workspaceRoot = await createWorkspace();
    const nestedDir = join(workspaceRoot, "apps", "crawler", "src", "scripts");
    await mkdir(nestedDir, { recursive: true });

    expect(resolveWorkspaceRoot(nestedDir)).toBe(workspaceRoot);
  });

  it("throws when workspace root marker is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-script-utils-no-root-"));
    tempRoots.push(root);

    await mkdir(join(root, "apps", "crawler"), { recursive: true });

    expect(() => resolveWorkspaceRoot(join(root, "apps", "crawler"))).toThrow(
      "Unable to resolve workspace root",
    );
  });

  it("resolves relative paths from the workspace and preserves absolute paths", async () => {
    const workspaceRoot = await createWorkspace();

    expect(resolveWorkspacePathArgument(workspaceRoot, "storage/snapshots")).toBe(
      join(workspaceRoot, "storage", "snapshots"),
    );
    expect(resolveWorkspacePathArgument(workspaceRoot, "/var/lib/partsradar/snapshots")).toBe(
      "/var/lib/partsradar/snapshots",
    );
  });

  it("redacts secrets from CLI error messages", () => {
    const message = toSafeCliErrorMessage(
      new Error(
        "failed DATABASE_URL=postgresql://partsradar:secret@db:5432/app --token abc PHPSESSID=local",
      ),
    );

    expect(message).toContain("DATABASE_URL=***");
    expect(message).toContain("--token ***");
    expect(message).toContain("PHPSESSID=***");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("abc");
    expect(message).not.toContain("local");
  });
});

async function createWorkspace(files: Record<string, string> = {}): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-script-utils-"));
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");

  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(workspaceRoot, path), content);
  }

  return workspaceRoot;
}
