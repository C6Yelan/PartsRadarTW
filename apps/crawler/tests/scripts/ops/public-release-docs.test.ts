// 驗證公開前 privacy／restore 文件保留必要 gate，避免文件更新與 runtime contract 漂移。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(__dirname, "../../../../..");

describe("public release trust-boundary documentation", () => {
  it("keeps restore fail-closed until privacy replay and Discord checks pass", async () => {
    const operations = await readFile(join(WORKSPACE_ROOT, "docs/operations.md"), "utf8");

    expect(operations).toContain("DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED");
    expect(operations).toContain("DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED");
    expect(operations).toContain("DISCORD_FEATURE_TARGET_WATCHES_ENABLED");
    expect(operations).toContain("pnpm db:deploy");
    expect(operations).toContain("pnpm db:configure-runtime-role");
    expect(operations).toContain("pnpm ops:discord-privacy -- cleanup");
    expect(operations).toContain("pending retry、target claim、notification cursor");
    expect(operations).toContain("才可逐一恢復 Discord feature flags");
    expect(operations).toContain("缺少清單或核准程序即為 NO-GO");
    expect(operations).not.toContain("DiscordErasureTombstone");
  });

  it("keeps public policy responsibilities separated from operations", async () => {
    const [operations, security, discord, readme] = await Promise.all([
      readFile(join(WORKSPACE_ROOT, "docs/operations.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "SECURITY.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "docs/discord.md"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "README.md"), "utf8"),
    ]);

    for (const externalOwner of ["Cloudflare", "TrueNAS", "GitHub", "Discord Portal", "CoolPC"]) {
      expect(operations).toContain(externalOwner);
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
