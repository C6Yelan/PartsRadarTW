// apps/crawler/src/scripts/ops/discord-bot/interactions/modal-submit/watch.ts
// 處理目標價 watch modal submit，協調輸入驗證回覆、watch 寫入與管理面板重繪。

import type { parseTargetPriceWatchModalSubmit } from "../../commands";
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
  formatTargetPriceWatchModalValidationMessage,
  readTargetPriceWatchManagerPage,
} from "../watch-manager";

type TargetPriceWatchModalSubmit = NonNullable<ReturnType<typeof parseTargetPriceWatchModalSubmit>>;

// 根據 watch modal parser 結果執行新增或編輯流程；驗證失敗時直接回覆使用者，不進入寫入。
export async function handleTargetPriceWatchModalSubmit({
  client,
  interaction,
  options,
  fetchImpl,
  discordUserId,
  targetPriceWatchModal,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  discordUserId: string;
  targetPriceWatchModal: TargetPriceWatchModalSubmit;
}): Promise<void> {
  if (
    !targetPriceWatchModal.targetPriceInputValid ||
    (targetPriceWatchModal.action === "create" && !targetPriceWatchModal.productInputValid)
  ) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: formatTargetPriceWatchModalValidationMessage(targetPriceWatchModal),
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

  if (targetPriceWatchModal.action === "edit") {
    const updateResult = await updateTargetPriceWatch({
      client,
      discordUserId,
      targetPriceWatchInput: targetPriceWatchModal.targetPriceWatchInput,
      targetPrice: targetPriceWatchModal.targetPrice,
    });
    const result = await readTargetPriceWatchManagerPage({
      client,
      discordUserId,
      page: targetPriceWatchModal.page,
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
        selectedWatchInput:
          updateResult.status === "updated" ? `watch:${updateResult.watch.id}` : null,
        notice:
          updateResult.status === "updated" ? "已更新目標價格。" : "無法更新追蹤，清單已重新整理。",
      }),
    });
    return;
  }

  const createResult = await createTargetPriceWatch({
    client,
    discordUserId,
    productInput: targetPriceWatchModal.productInput,
    targetPrice: targetPriceWatchModal.targetPrice,
  });

  if (createResult.status === "saved") {
    const result = await readTargetPriceWatchManagerPage({ client, discordUserId, page: 0 });

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
