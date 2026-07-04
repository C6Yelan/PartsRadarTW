// apps/crawler/tests/scripts/ops/discord-bot/interaction-help.test.ts
import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import {
  createBotHelpInteraction,
  createDiscordBotClient,
  createDiscordBotOptions,
  readResponseEmbed,
} from "./support";

describe("handleDiscordInteraction bot help", () => {
  it("responds to bot help with an ephemeral Traditional Chinese embed", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await handleDiscordInteraction({
      client,
      options: createDiscordBotOptions(),
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createBotHelpInteraction(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.discordTargetPriceWatch.findMany).not.toHaveBeenCalled();
    expect(client.discordPriceReportSetting.findUnique).not.toHaveBeenCalled();
    expect(client.discordPublicPriceReportSetting.findUnique).not.toHaveBeenCalled();

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    const embed = readResponseEmbed(requestBody);

    expect(requestBody).toMatchObject({
      type: 4,
      data: {
        flags: 64,
      },
    });
    expect(embed).toMatchObject({
      title: "PartsRadarTW Discord bot 說明",
      description: expect.stringContaining("**/watch**"),
    });
    expect(embed.description).toContain("個人商品目標價追蹤");
    expect(embed.description).toContain("個人價格報告");
    expect(embed.description).toContain("伺服器公開價格報告");
    expect(embed.description).toContain("管理伺服器");
  });
});
