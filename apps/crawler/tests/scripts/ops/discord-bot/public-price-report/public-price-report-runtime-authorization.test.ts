// apps/crawler/tests/scripts/ops/discord-bot/public-price-report/public-price-report-runtime-authorization.test.ts
// 驗證 public-report slash、component 與 modal 會以當次 member permissions fail closed。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/interactions";
import type { DiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/types";
import { createDiscordBotClient } from "../support/client";
import { publicPriceReportSetting } from "../support/data-factories";
import {
  createPublicReportButtonInteraction,
  createPublicReportInteraction,
  createPublicReportKeywordModalSubmitInteraction,
  createPublicReportSelectInteraction,
} from "../support/interactions-public-report";
import { API_BASE_URL, createDiscordBotOptions } from "../support/options";

const AUTHORIZATION_DENIED_MESSAGE = "這次操作無法通過公開價格報告的權限檢查。";

const interactionKinds = [
  {
    name: "slash command",
    create: () => createPublicReportInteraction(),
  },
  {
    name: "message component",
    create: () => createPublicReportButtonInteraction("public-report:disable"),
  },
  {
    name: "modal submit",
    create: () =>
      createPublicReportKeywordModalSubmitInteraction({
        keywords: ["SSD"],
      }),
  },
] as const;

const authorizedPermissionCases = [
  { name: "Manage Guild", permissions: "32" },
  { name: "Administrator", permissions: "8" },
  { name: "Manage Guild and Administrator", permissions: "40" },
] as const;

const deniedPermissionCases = [
  {
    name: "ordinary member",
    mutate(interaction: DiscordInteraction) {
      setMemberPermissions(interaction, "0");
    },
  },
  {
    name: "member whose permission was revoked after opening an old panel",
    mutate(interaction: DiscordInteraction) {
      setMemberPermissions(interaction, "0");
    },
  },
  {
    name: "missing member",
    mutate(interaction: DiscordInteraction) {
      delete interaction.member;
    },
  },
  {
    name: "missing member permissions",
    mutate(interaction: DiscordInteraction) {
      if (interaction.member) {
        delete interaction.member.permissions;
      }
    },
  },
  {
    name: "invalid member permissions",
    mutate(interaction: DiscordInteraction) {
      setMemberPermissions(interaction, "not-a-bitfield");
    },
  },
  {
    name: "overflowing member permissions",
    mutate(interaction: DiscordInteraction) {
      setMemberPermissions(interaction, "18446744073709551616");
    },
  },
  {
    name: "DM context",
    mutate(interaction: DiscordInteraction) {
      delete interaction.guild_id;
    },
  },
] as const;

describe.each(interactionKinds)("public-report $name runtime authorization", ({ create }) => {
  it.each(authorizedPermissionCases)("allows $name permission", async ({ permissions }) => {
    const interaction = create();
    setMemberPermissions(interaction, permissions);
    const client = createDiscordBotClient({
      publicPriceReportSettings: [publicPriceReportSetting({ id: "public-setting-1" })],
    });
    const fetchMock = createSuccessfulFetchMock();

    await handleDiscordInteraction({
      client,
      interaction,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(countDatabaseCalls(client)).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls.map((call) => String(call[1]?.body)).join("\n")).not.toContain(
      AUTHORIZATION_DENIED_MESSAGE,
    );
  });

  it.each(deniedPermissionCases)("denies $name", async ({ mutate }) => {
    const interaction = create();
    mutate(interaction);
    const client = createDiscordBotClient({
      publicPriceReportSettings: [publicPriceReportSetting({ id: "public-setting-1" })],
    });
    const fetchMock = createSuccessfulFetchMock();

    await handleDiscordInteraction({
      client,
      interaction,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(countDatabaseCalls(client)).toBe(0);
    expectSingleAuthorizationDenial(fetchMock, interaction);
  });
});

describe("public-report component authorization coverage", () => {
  it.each([
    {
      name: "set channel",
      create: () => createPublicReportButtonInteraction("public-report:set-channel"),
    },
    {
      name: "enable",
      create: () => createPublicReportButtonInteraction("public-report:enable"),
    },
    {
      name: "disable",
      create: () => createPublicReportButtonInteraction("public-report:disable"),
    },
    {
      name: "clear",
      create: () => createPublicReportButtonInteraction("public-report:clear"),
    },
    {
      name: "preview",
      create: () => createPublicReportButtonInteraction("public-report:preview"),
    },
    {
      name: "open keyword modal",
      create: () => createPublicReportButtonInteraction("public-report:keyword"),
    },
    {
      name: "categories",
      create: () => createPublicReportSelectInteraction("public-report:categories", ["12"]),
    },
    {
      name: "all categories",
      create: () => createPublicReportButtonInteraction("public-report:all-categories"),
    },
    {
      name: "content filters",
      create: () => createPublicReportSelectInteraction("public-report:events", ["price_drops"]),
    },
  ])("blocks unauthorized $name before any management side effect", async ({ create }) => {
    const interaction = create();
    setMemberPermissions(interaction, "0");
    const client = createDiscordBotClient({
      publicPriceReportSettings: [publicPriceReportSetting({ id: "public-setting-1" })],
    });
    const cooldowns = new CommandCooldowns(60);
    const fetchMock = createSuccessfulFetchMock();

    await handleDiscordInteraction({
      client,
      interaction,
      options: createDiscordBotOptions(),
      cooldowns,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(countDatabaseCalls(client)).toBe(0);
    expectSingleAuthorizationDenial(fetchMock, interaction);
    expect(cooldowns.consume("111122223333444455", new Date()).allowed).toBe(true);
  });

  it("uses the current interaction guild instead of stale panel context", async () => {
    const client = createDiscordBotClient({
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "origin-setting",
          discordGuildId: "origin-guild",
        }),
        publicPriceReportSetting({
          id: "current-setting",
          discordGuildId: "current-guild",
        }),
      ],
    });
    const fetchMock = createSuccessfulFetchMock();

    await handleDiscordInteraction({
      client,
      interaction: createPublicReportButtonInteraction("public-report:clear", {
        guildId: "current-guild",
      }),
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(client.discordPublicPriceReportSetting.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { discordGuildId: "current-guild" },
    });
  });
});

function setMemberPermissions(interaction: DiscordInteraction, permissions: string): void {
  if (!interaction.member) {
    throw new Error("Expected test interaction member.");
  }

  interaction.member.permissions = permissions;
}

function createSuccessfulFetchMock() {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
  );
}

function countDatabaseCalls(client: ReturnType<typeof createDiscordBotClient>): number {
  let callCount = 0;

  for (const delegate of Object.values(
    client as unknown as Record<string, Record<string, unknown>>,
  )) {
    for (const method of Object.values(delegate)) {
      if (vi.isMockFunction(method)) {
        callCount += method.mock.calls.length;
      }
    }
  }

  return callCount;
}

function expectSingleAuthorizationDenial(
  fetchMock: ReturnType<typeof createSuccessfulFetchMock>,
  interaction: DiscordInteraction,
): void {
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const [url, requestInit] = fetchMock.mock.calls[0] as [Parameters<typeof fetch>[0], RequestInit];
  const body = JSON.parse(String(requestInit.body));

  expect(String(url)).toBe(
    `${API_BASE_URL}/interactions/${interaction.id}/${interaction.token}/callback`,
  );
  expect(body).toMatchObject({
    type: 4,
    data: {
      content: AUTHORIZATION_DENIED_MESSAGE,
      flags: 64,
    },
  });
  expect(JSON.stringify(body)).not.toContain("guild-1");
  expect(JSON.stringify(body)).not.toContain("999988887777666655");
  expect(JSON.stringify(body)).not.toContain("111122223333444455");
  expect(body.type).not.toBe(5);
  expect(body.type).not.toBe(6);
  expect(body.type).not.toBe(9);
}
