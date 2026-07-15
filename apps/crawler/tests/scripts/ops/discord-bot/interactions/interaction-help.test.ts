// apps/crawler/tests/scripts/ops/discord-bot/interactions/interaction-help.test.ts
// 驗證 /bot help 會回覆私密說明 embed，並涵蓋主要 Discord bot 功能入口。

import { describe, expect, it, vi } from "vitest";
import { CommandCooldowns } from "../../../../../src/scripts/ops/discord-bot/cooldowns";
import { handleDiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/interactions";
import {
  createBotHelpInteraction,
  createDiscordBotClient,
  createDiscordBotOptions,
  readResponseEmbed,
} from "../support";

describe("handleDiscordInteraction bot help", () => {
  it("responds to bot help with an ephemeral Traditional Chinese embed", async () => {
    const client = createDiscordBotClient();
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
      title: "PartsRadarTW 使用說明",
      description: "選擇你想完成的事情，再使用對應指令。所有設定面板只會顯示給操作者。",
    });
    expect(embed.fields).toHaveLength(6);
    const helpText = JSON.stringify(embed.fields);
    expect(helpText).toContain("/watch");
    expect(helpText).toContain("/price-report now");
    expect(helpText).toContain("/price-report settings");
    expect(helpText).toContain("/public-report settings");
    expect(helpText).toContain("/status");
    expect(helpText).not.toContain("/public-report manage");
    expect(helpText).not.toContain("/public-report test");
    expect(requestBody.data.components).toEqual([
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "查看完整使用教學",
            url: "https://partsradar.test/discord",
          },
        ],
      },
    ]);
    expect(JSON.stringify(requestBody)).not.toContain("partsradar.net");
    expect(embed).not.toHaveProperty("image");
  });
});
