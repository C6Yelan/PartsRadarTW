// apps/crawler/src/scripts/ops/discord-bot/interactions/watch-handler.ts

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
  consumeTargetPriceWatchBulkRemovalConfirmation,
  createTargetPriceWatchBulkRemovalConfirmation,
  createTargetPriceWatchBulkRemovalConfirmationMessage,
  createTargetPriceWatchBulkRemovalMessage,
  createTargetPriceWatchRemovalConfirmationMessage,
  disableTargetPriceWatch,
  disableTargetPriceWatches,
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
        statusFilter: component.statusFilter,
        sortKey: component.sortKey,
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
        statusFilter: component.statusFilter,
        sortKey: component.sortKey,
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
      statusFilter: component.statusFilter,
      sortKey: component.sortKey,
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

  if (component.action === "bulk_remove") {
    const result = await readTargetPriceWatchManagerPage({
      client,
      discordUserId,
      page: component.page,
      statusFilter: component.statusFilter,
      sortKey: component.sortKey,
    });

    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createTargetPriceWatchBulkRemovalMessage({
        result,
        page: component.page,
      }),
    });
    return;
  }

  if (component.action === "bulk_remove_select") {
    const result = await readTargetPriceWatchManagerPage({
      client,
      discordUserId,
      page: component.page,
      statusFilter: component.statusFilter,
      sortKey: component.sortKey,
    });
    const token = createTargetPriceWatchBulkRemovalConfirmation({
      discordUserId,
      targetPriceWatchInputs: component.targetPriceWatchInputs,
      page: result.page,
      statusFilter: result.statusFilter,
      sortKey: result.sortKey,
    });

    await editDeferredInteractionResponse({
      token: options.token,
      applicationId: options.applicationId,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      message: createTargetPriceWatchBulkRemovalConfirmationMessage({
        result,
        publicBaseUrl: options.publicBaseUrl,
        selectedWatchInputs: component.targetPriceWatchInputs,
        token,
      }),
    });
    return;
  }

  if (component.action === "bulk_remove_confirm" || component.action === "bulk_remove_cancel") {
    const confirmation = consumeTargetPriceWatchBulkRemovalConfirmation({
      token: component.token,
      discordUserId,
    });
    const shouldRemove =
      component.action === "bulk_remove_confirm" && confirmation.status === "found";
    const disabled = shouldRemove
      ? await disableTargetPriceWatches({
          client,
          discordUserId,
          targetPriceWatchInputs: confirmation.targetPriceWatchInputs,
        })
      : null;
    const result = await readTargetPriceWatchManagerPage({
      client,
      discordUserId,
      page: confirmation.status === "found" ? confirmation.page : 0,
      statusFilter: confirmation.status === "found" ? confirmation.statusFilter : "all",
      sortKey: confirmation.status === "found" ? confirmation.sortKey : "recent",
    });
    const notice =
      confirmation.status !== "found"
        ? "批次移除確認已失效，請重新選擇。"
        : component.action === "bulk_remove_cancel"
          ? "已取消批次移除。"
          : disabled && disabled.disabledCount > 0
            ? `已批次移除 ${disabled.disabledCount} 項目標價追蹤。`
            : "選取的追蹤已不存在，清單已重新整理。";

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
        notice,
      }),
    });
    return;
  }

  if (
    component.action !== "select" &&
    component.action !== "cancel_remove" &&
    component.action !== "refresh" &&
    component.action !== "page" &&
    component.action !== "filter" &&
    component.action !== "sort"
  ) {
    await sendUnsupportedInteractionResponse({ interaction, options, fetchImpl });
    return;
  }

  const result = await readTargetPriceWatchManagerPage({
    client,
    discordUserId,
    page: component.page,
    statusFilter: component.statusFilter,
    sortKey: component.sortKey,
  });
  const selectedWatchInput =
    component.action === "select" || component.action === "cancel_remove"
      ? component.targetPriceWatchInput
      : null;

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
