// apps/crawler/tests/scripts/ops/discord-bot-options.test.ts
import { describe, expect, it } from "vitest";
import { formatDiscordBotCliError } from "../../../src/scripts/ops/discord-bot/cli-error";
import { parseDiscordBotOptions } from "../../../src/scripts/ops/discord-bot/options";
import { normalizeWatchProductReference } from "../../../src/scripts/ops/discord-bot/watch";

import {
  APPLICATION_ID,
  PUBLIC_BASE_URL,
  TOKEN,
  WATCH_PRODUCT_ID,
} from "./discord-bot/support";

describe("Discord bot options", () => {
  it("parses required bot settings and safe defaults", () => {
    expect(
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: APPLICATION_ID,
        PARTSRADAR_PUBLIC_BASE_URL: PUBLIC_BASE_URL,
      }),
    ).toMatchObject({
      token: TOKEN,
      applicationId: APPLICATION_ID,
      publicBaseUrl: "https://partsradar.test/",
      apiBaseUrl: "https://discord.com/api/v10",
      registerCommands: false,
      registerCommandsOnStart: true,
      publicReportsEnabled: true,
      personalReportsEnabled: true,
      targetWatchesEnabled: true,
      priceReportMaxItems: 50,
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
});

describe("Discord bot CLI errors", () => {
  it("prints a safe startup error summary", () => {
    const message = formatDiscordBotCliError(
      new Error(
        "failed DATABASE_URL=postgresql://partsradar:secret@db:5432/app DISCORD_BOT_TOKEN=abc",
      ),
    );

    expect(message).toContain("DATABASE_URL=***");
    expect(message).toContain("DISCORD_BOT_TOKEN=***");
    expect(message).not.toContain("secret@db");
    expect(message).not.toContain("DISCORD_BOT_TOKEN=abc");
  });
});

describe("normalizeWatchProductReference", () => {
  it("accepts product ids and PartsRadarTW product URLs", () => {
    expect(normalizeWatchProductReference(WATCH_PRODUCT_ID.toUpperCase())).toBe(WATCH_PRODUCT_ID);
    expect(
      normalizeWatchProductReference(`https://partsradar.test/products/${WATCH_PRODUCT_ID}`),
    ).toBe(WATCH_PRODUCT_ID);
    expect(normalizeWatchProductReference(`/products/${WATCH_PRODUCT_ID}`)).toBe(WATCH_PRODUCT_ID);
    expect(
      normalizeWatchProductReference("https://partsradar.test/products/not-a-product"),
    ).toBeNull();
    expect(normalizeWatchProductReference("/products/%E0%A4%A")).toBeNull();
  });
});
