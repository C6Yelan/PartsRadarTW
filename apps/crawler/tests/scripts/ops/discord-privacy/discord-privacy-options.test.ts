// apps/crawler/tests/scripts/ops/discord-privacy/discord-privacy-options.test.ts
// 驗證 privacy CLI 的 snowflake、dry-run confirmation 與輸出遮罩邊界。

import { describe, expect, it } from "vitest";
import { parseDiscordPrivacyCommand } from "../../../../src/scripts/ops/discord-privacy/options";
import { maskDiscordId } from "../../../../src/scripts/ops/discord-privacy/runner";

describe("Discord privacy CLI options", () => {
  it("keeps erase in dry-run mode unless the explicit confirmation flag is present", () => {
    expect(
      parseDiscordPrivacyCommand(["erase-user", "--discord-user-id", "111122223333444455"]),
    ).toMatchObject({ action: "erase-user", execute: false });
    expect(
      parseDiscordPrivacyCommand([
        "erase-user",
        "--discord-user-id",
        "111122223333444455",
        "--confirm-erase",
      ]),
    ).toMatchObject({ action: "erase-user", execute: true });
  });

  it("fails closed for invalid identifiers, duplicate identifiers and unknown flags", () => {
    expect(() =>
      parseDiscordPrivacyCommand(["inspect-user", "--discord-user-id", "not-a-snowflake"]),
    ).toThrow("must be a Discord snowflake id");
    expect(() =>
      parseDiscordPrivacyCommand([
        "inspect-user",
        "--discord-user-id",
        "111122223333444455",
        "--discord-user-id",
        "999900001111222233",
      ]),
    ).toThrow("may only be provided once");
    expect(() =>
      parseDiscordPrivacyCommand([
        "erase-guild",
        "--discord-guild-id",
        "111122223333444455",
        "--force",
      ]),
    ).toThrow("Unknown Discord privacy option");
  });

  it("never returns the complete Discord identifier for output", () => {
    const id = "111122223333444455";
    const masked = maskDiscordId(id);

    expect(masked).toBe("11…55");
    expect(masked).not.toContain(id);
  });
});
