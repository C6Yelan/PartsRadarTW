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
      title: "PartsRadarTW Discord bot 說明",
      description: expect.stringContaining("**目標價提醒｜`/watch`**"),
    });
    expect(embed.description).toContain("**即時價格報告｜`/price-report now`**");
    expect(embed.description).toContain("**每日私訊價格報告｜`/price-report settings`**");
    expect(embed.description).toContain("**公開價格報告｜`/public-report status/manage/test`**");
    expect(embed.description).toContain("**DM、伺服器與權限**");
    expect(embed.description).toContain("價格達標時會嘗試透過 DM 傳送目標價提醒");
    expect(embed.description).toContain("只限伺服器使用");
    expect(embed.description).toContain("管理伺服器");
    expect(embed.description).toContain("傳送訊息");
    expect(embed.description).toContain("嵌入連結");
    expect(embed).not.toHaveProperty("image");
  });
});
