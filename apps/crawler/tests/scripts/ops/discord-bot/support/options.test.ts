// apps/crawler/tests/scripts/ops/discord-bot/support/options.test.ts
// 驗證 Discord bot 啟動設定解析與 CLI help。

import { describe, expect, it, vi } from "vitest";
import {
  parseDiscordBotOptions,
  printDiscordBotHelp,
} from "../../../../../src/scripts/ops/discord-bot/options";
import { APPLICATION_ID, TOKEN } from "./options";

describe("Discord bot options", () => {
  it("parses required bot settings and safe defaults", () => {
    expect(
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: APPLICATION_ID,
        PARTSRADAR_PUBLIC_BASE_URL: "  https://partsradar.test/base/?source=test#section  ",
      }),
    ).toMatchObject({
      token: TOKEN,
      applicationId: APPLICATION_ID,
      publicBaseUrl: "https://partsradar.test/base",
      apiBaseUrl: "https://discord.com/api/v10",
      registerCommandsOnStart: true,
      publicReportsEnabled: true,
      personalReportsEnabled: true,
      targetWatchesEnabled: true,
      commandCooldownSeconds: 60,
      priceReportScheduleIntervalSeconds: 300,
    });
  });

  it("parses Discord feature flags with safe enabled defaults", () => {
    expect(
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: APPLICATION_ID,
        DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED: "false",
        DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED: "0",
        DISCORD_FEATURE_TARGET_WATCHES_ENABLED: "no",
        DISCORD_BOT_REGISTER_COMMANDS_ON_START: "yes",
      }),
    ).toMatchObject({
      publicReportsEnabled: false,
      personalReportsEnabled: false,
      targetWatchesEnabled: false,
      registerCommandsOnStart: true,
    });

    expect(
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: APPLICATION_ID,
        DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED: "1",
        DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED: "true",
        DISCORD_FEATURE_TARGET_WATCHES_ENABLED: "yes",
        DISCORD_BOT_REGISTER_COMMANDS_ON_START: "0",
      }),
    ).toMatchObject({
      publicReportsEnabled: true,
      personalReportsEnabled: true,
      targetWatchesEnabled: true,
      registerCommandsOnStart: false,
    });
  });

  it("rejects missing token or invalid ids", () => {
    expect(() => parseDiscordBotOptions([], {})).toThrow("DISCORD_BOT_TOKEN is required");
    expect(() =>
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: "not-an-id",
      }),
    ).toThrow("DISCORD_APPLICATION_ID must be a Discord snowflake id");
  });

  it("only accepts official Discord transport endpoints in production", () => {
    const productionEnv = {
      NODE_ENV: "production",
      DISCORD_BOT_TOKEN: TOKEN,
      DISCORD_APPLICATION_ID: APPLICATION_ID,
    };

    expect(() => parseDiscordBotOptions([], productionEnv)).not.toThrow();
    expect(() =>
      parseDiscordBotOptions([], {
        ...productionEnv,
        DISCORD_API_BASE_URL: "https://discord.test/api/v10",
      }),
    ).toThrow("official Discord HTTPS API");
    expect(() =>
      parseDiscordBotOptions([], {
        ...productionEnv,
        DISCORD_GATEWAY_URL: "wss://discord.test/gateway",
      }),
    ).toThrow("official Discord WSS gateway");
  });

  it("keeps help focused on startup and one-shot command registration", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printDiscordBotHelp();

    const output = log.mock.calls.flat().join("\n");
    log.mockRestore();

    expect(output).toContain("Usage:");
    expect(output).toContain("--register-commands");
    expect(output).not.toContain("--price-report-max-items");
    expect(output).not.toContain("DISCORD_PRICE_REPORT_MAX_ITEMS");
    expect(output).not.toContain("Environment:");
  });
});
