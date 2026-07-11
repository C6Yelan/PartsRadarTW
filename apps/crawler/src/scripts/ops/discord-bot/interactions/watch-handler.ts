// apps/crawler/src/scripts/ops/discord-bot/interactions/watch-handler.ts
// 處理 target-price watch 管理面板的 component interaction，協調新增、編輯、單筆移除與分頁。

import {
  createWatchEditModal,
  createWatchModal,
  type parseTargetPriceWatchComponentInteraction,
} from "../commands";
import {
  deferInteractionMessageUpdate,
  editDeferredInteractionResponse,
  sendModalInteractionResponse,
} from "../rest";
import type { DiscordBotClient, DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";
import {
  createTargetPriceWatchRemovalConfirmationMessage,
  disableTargetPriceWatch,
  readTargetPriceWatch,
} from "../watch";
import { sendUnsupportedInteractionResponse } from "./responses";
import {
  createTargetPriceWatchManagerMessageWithDelivery,
  extractTargetPriceWatchId,
  readTargetPriceWatchManagerPage,
} from "./watch-manager";

type TargetPriceWatchComponent = NonNullable<
  ReturnType<typeof parseTargetPriceWatchComponentInteraction>
>;

// 根據 watch component action 執行對應互動；所有查詢與寫入都以 discordUserId 綁定目前使用者。
export async function handleTargetPriceWatchComponentInteraction({
  client,
  interaction,
  options,
  fetchImpl,
  discordUserId,
  component,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  discordUserId: string;
  component: TargetPriceWatchComponent;
}): Promise<void> {
  if (component.action === "add") {
    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createWatchModal(),
    });
    return;
  }

  if (component.action === "edit") {
    const watchId = extractTargetPriceWatchId(component.targetPriceWatchInput);

    if (!watchId || !component.targetPrice) {
      await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
      return;
    }

    await sendModalInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      modal: createWatchEditModal({
        watchId,
        targetPrice: component.targetPrice,
        page: component.page,
      }),
    });
    return;
  }

  await deferInteractionMessageUpdate({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
  });

  if (component.action === "remove") {
    const lookup = await readTargetPriceWatch({
      client,
      discordUserId,
      targetPriceWatchInput: component.targetPriceWatchInput,
    });

    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createTargetPriceWatchRemovalConfirmationMessage({
        result: lookup,
        publicBaseUrl: options.publicBaseUrl,
        page: component.page,
      }),
    });
    return;
  }

  if (component.action === "confirm_remove") {
    const disabled = await disableTargetPriceWatch({
      client,
      discordUserId,
      targetPriceWatchInput: component.targetPriceWatchInput,
    });
    const result = await readTargetPriceWatchManagerPage({
      client,
      discordUserId,
      page: component.page,
    });

    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: await createTargetPriceWatchManagerMessageWithDelivery({
        client,
        discordUserId,
        result,
        publicBaseUrl: options.publicBaseUrl,
        notice:
          disabled.status === "disabled" ? "已移除目標價追蹤。" : "追蹤已不存在，清單已重新整理。",
      }),
    });
    return;
  }

  const result = await readTargetPriceWatchManagerPage({
    client,
    discordUserId,
    page: component.page,
  });
  const selectedWatchInput =
    "targetPriceWatchInput" in component ? component.targetPriceWatchInput : null;

  await editDeferredInteractionResponse({
    token: options.token,
    applicationId: options.applicationId,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    message: await createTargetPriceWatchManagerMessageWithDelivery({
      client,
      discordUserId,
      result,
      publicBaseUrl: options.publicBaseUrl,
      selectedWatchInput,
    }),
  });
}
