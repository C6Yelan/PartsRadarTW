// apps/crawler/src/scripts/ops/discord-bot/interactions/modal-submit/watch.ts

import type { parseWatchModalSubmit } from "../../commands";
import {
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendInteractionResponse,
} from "../../rest";
import type {
  DiscordBotClient,
  DiscordBotOptions,
  DiscordInteraction,
  FetchImpl,
} from "../../types";
import {
  createTargetPriceWatch,
  createTargetPriceWatchResponseMessage,
  updateTargetPriceWatch,
} from "../../watch";
import {
  createTargetPriceWatchManagerMessageWithDelivery,
  formatWatchModalValidationMessage,
  readWatchManagerPage,
} from "../watch-manager";

type WatchModalSubmit = NonNullable<ReturnType<typeof parseWatchModalSubmit>>;

export async function handleWatchModalSubmit({
  client,
  interaction,
  options,
  fetchImpl,
  discordUserId,
  watchModal,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  discordUserId: string;
  watchModal: WatchModalSubmit;
}): Promise<void> {
  if (
    !watchModal.targetPriceInputValid ||
    (watchModal.action === "create" && !watchModal.productInputValid)
  ) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: formatWatchModalValidationMessage(watchModal),
    });
    return;
  }

  await deferInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    ephemeral: true,
  });

  if (watchModal.action === "edit") {
    const updateResult = await updateTargetPriceWatch({
      client,
      discordUserId,
      watchInput: watchModal.watchInput,
      targetPrice: watchModal.targetPrice,
    });
    const result = await readWatchManagerPage({
      client,
      discordUserId,
      page: watchModal.page,
      statusFilter: watchModal.statusFilter,
      sortKey: watchModal.sortKey,
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
        selectedWatchInput: updateResult.status === "updated" ? `watch:${updateResult.watch.id}` : null,
        notice:
          updateResult.status === "updated"
            ? "已更新目標價格。"
            : "無法更新追蹤，清單已重新整理。",
      }),
    });
    return;
  }

  const createResult = await createTargetPriceWatch({
    client,
    discordUserId,
    productInput: watchModal.productInput,
    targetPrice: watchModal.targetPrice,
  });

  if (createResult.status === "saved") {
    const result = await readWatchManagerPage({ client, discordUserId, page: 0 });

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
        selectedWatchInput: `watch:${createResult.watch.id}`,
        notice: "已儲存商品目標價。",
      }),
    });
    return;
  }

  await editDeferredInteractionResponse({
    token: options.token,
    applicationId: options.applicationId,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    message: createTargetPriceWatchResponseMessage({
      result: createResult,
      publicBaseUrl: options.publicBaseUrl,
    }),
  });
}
