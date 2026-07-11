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
  sanitizeSensitiveText,
  toSafeCliErrorMessage,
} from "../../../src/scripts/shared/script-utils";

const TEST_ENV_KEYS = [
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
  it("loads only .env and preserves existing process env values", async () => {
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

    process.env.PARTSRADAR_SCRIPT_UTILS_EXISTING = "from_process";

    await loadWorkspaceEnv(workspaceRoot);

    expect(process.env.PARTSRADAR_SCRIPT_UTILS_VALUE).toBe("from_env");
    expect(process.env.PARTSRADAR_SCRIPT_UTILS_EXISTING).toBe("from_process");
    expect(process.env.PARTSRADAR_SCRIPT_UTILS_LOCAL_ONLY).toBeUndefined();
  });

  it("reports invalid env keys by relative path and line without echoing input", async () => {
    const workspaceRoot = await createWorkspace({
      ".env": "VALID=value\nBAD-KEY=fake-secret-value",
    });

    await expect(loadWorkspaceEnv(workspaceRoot)).rejects.toThrow(
      /^Invalid env key in \.env at line 2\.$/,
    );
  });

  it("does not echo malformed env assignment content", async () => {
    const workspaceRoot = await createWorkspace({
      ".env": "VALID=value\nDISCORD_BOT_TOKEN fake-secret-value",
    });

    await expect(loadWorkspaceEnv(workspaceRoot)).rejects.toThrow(
      /^Invalid env assignment in \.env at line 2\.$/,
    );
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
        "failed DATABASE_URL=postgresql://fake-user:fake-password@db:5432/app --token fake-cli-token PHPSESSID=fake-session",
      ),
    );

    expect(message).toContain("DATABASE_URL=[redacted]");
    expect(message).toContain("--token [redacted]");
    expect(message).toContain("PHPSESSID=[redacted]");
    expect(message).not.toContain("fake-password");
    expect(message).not.toContain("fake-cli-token");
    expect(message).not.toContain("fake-session");
  });

  it("uses one sanitizer for confirmed secret formats without changing ordinary text", () => {
    const message = sanitizeSensitiveText(
      [
        "API_TOKEN=fake-env-token",
        "ADMIN_PASSWORD=fake-env-password",
        "CLIENT_SECRET=fake-env-secret",
        "Authorization: Bearer fake-bearer-token",
        "authorization=Bot fake-bot-token",
        "--password fake-cli-password",
        "token: fake-colon-token",
        "postgresql://fake-user:fake-password@db.example/app",
        "https://discord.com/api/webhooks/123/fake-webhook-token",
        "https://www.coolpc.com.tw/evaluate.php?i=123",
        "產品 5090 目前價格 12345",
      ].join("\n"),
    );

    for (const secret of [
      "fake-env-token",
      "fake-env-password",
      "fake-env-secret",
      "fake-bearer-token",
      "fake-bot-token",
      "fake-cli-password",
      "fake-colon-token",
      "fake-user",
      "fake-password",
      "fake-webhook-token",
    ]) {
      expect(message).not.toContain(secret);
    }

    expect(message).toContain("https://www.coolpc.com.tw/evaluate.php?i=123");
    expect(message).toContain("產品 5090 目前價格 12345");
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
