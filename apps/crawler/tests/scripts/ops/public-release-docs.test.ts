// 驗證公開前 privacy／restore 文件保留必要 gate，避免文件更新與 runtime contract 漂移。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(__dirname, "../../../../..");

describe("public release trust-boundary documentation", () => {
  it("keeps production container commands aligned with the lean crawler image", async () => {
    const [operations, crawler, discord, release, workflow] = await Promise.all([
      readFile(join(WORKSPACE_ROOT, "docs/operations/README.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "docs/operations/crawler.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "docs/operations/discord.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "docs/deployment/release.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, ".github/workflows/ci.yml"), "utf8"),
    ]);
    const privateSmokeEntrypoint =
      "node --import tsx src/scripts/ops/production-smoke.ts --base-url http://web:3000";

    expect(operations).toContain(privateSmokeEntrypoint);
    expect(release).toContain("[Private full smoke](../operations/README.md#full-smoke)");
    for (const runbook of [operations, crawler, discord]) {
      expect(runbook).not.toMatch(/\\\n\s+pnpm /);
    }
    expect(workflow).toContain("node --import tsx src/scripts/ops/production-smoke.ts --help");
  });

  it("keeps restore fail-closed until privacy replay and Discord checks pass", async () => {
    const recovery = await readFile(join(WORKSPACE_ROOT, "docs/operations/recovery.md"), "utf8");

    expect(recovery).toContain("DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED");
    expect(recovery).toContain("DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED");
    expect(recovery).toContain("DISCORD_FEATURE_TARGET_WATCHES_ENABLED");
    expect(recovery).toContain("pnpm db:deploy");
    expect(recovery).toContain("pnpm db:configure-runtime-role");
    expect(recovery).toContain("pnpm ops:discord-privacy -- cleanup");
    expect(recovery).toContain("pending retry、target claim、notification cursor");
    expect(recovery).toContain("才可逐一恢復 Discord feature flags");
    expect(recovery).toContain("缺少清單或核准程序即為 NO-GO");
    expect(recovery).not.toContain("DiscordErasureTombstone");
  });

  it("keeps public policy responsibilities separated from operations", async () => {
    const [operations, security, discord, readme] = await Promise.all([
      readFile(join(WORKSPACE_ROOT, "docs/operations/README.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "SECURITY.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "docs/discord.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "README.md"), "utf8"),
    ]);

    for (const externalGate of [
      "Public ingress",
      "備份",
      "GitHub",
      "Discord Portal",
      "來源抓取頻率",
    ]) {
      expect(operations).toContain(externalGate);
    }
    expect(security).toContain("contact@partsradar.net");
    expect(security).toContain("https://partsradar.net/privacy");
    for (const operationalDetail of [
      "Repository 與部署端責任",
      "TrueNAS",
      "Compose",
      "migration",
    ]) {
      expect(security).not.toContain(operationalDetail);
    }
    expect(discord).toContain("[隱私權政策](https://partsradar.net/privacy)");
    expect(discord).not.toContain("[Security Policy]");
    expect(readme).toContain("| 安全漏洞回報 | [SECURITY.md](SECURITY.md) |");
  });
});
