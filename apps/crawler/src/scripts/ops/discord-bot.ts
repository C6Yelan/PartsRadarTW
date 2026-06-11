// apps/crawler/src/scripts/ops/discord-bot.ts
import type { DiscordPriceReportSetting, PrismaClient } from "@partsradar/db";
import {
  normalizePublicBaseUrl,
  readRecentPriceReport,
  type PriceChangeDiscordClient,
  type PriceChangeDiscordNotificationItem,
  type PriceReportNewProductItem,
  type RecentPriceReport,
} from "./price-change-discord-notification";
import {
  getStringArg,
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

const DEFAULT_DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DEFAULT_DISCORD_GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const DEFAULT_PUBLIC_BASE_URL = "https://partsradar.net";
const DEFAULT_PRICE_REPORT_MAX_ITEMS = 50;
const MAX_PRICE_REPORT_ITEMS = 50;
const DEFAULT_COMMAND_COOLDOWN_SECONDS = 60;
const DEFAULT_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS = 300;
const MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE = 25;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TIME_ZONE = "Asia/Taipei";
const DISCORD_EPHEMERAL_MESSAGE_FLAG = 64;
const DISCORD_COMMAND_TYPE_CHAT_INPUT = 1;
const DISCORD_OPTION_TYPE_SUBCOMMAND = 1;
const DISCORD_OPTION_TYPE_STRING = 3;
const DISCORD_OPTION_TYPE_INTEGER = 4;
const DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const DISCORD_INTERACTION_CALLBACK_CHANNEL_MESSAGE = 4;
const DISCORD_INTERACTION_CALLBACK_DEFERRED_CHANNEL_MESSAGE = 5;
const DISCORD_APPLICATION_CONTEXT_GUILD = 0;
const DISCORD_APPLICATION_CONTEXT_BOT_DM = 1;
const DISCORD_EMBED_COLOR = 0x2563eb;
const DISCORD_EMBED_MAX_FIELDS = 25;
const DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH = 1024;
const DISCORD_EMBED_TITLE_MAX_LENGTH = 256;
const DISCORD_EMBED_DESCRIPTION_MAX_LENGTH = 4096;
const DISCORD_EMBED_FOOTER_TEXT_MAX_LENGTH = 2048;
const DISCORD_MESSAGE_CONTENT_MAX_LENGTH = 2000;
const PRODUCT_NAME_MAX_LENGTH = 96;
const GATEWAY_OP_DISPATCH = 0;
const GATEWAY_OP_HEARTBEAT = 1;
const GATEWAY_OP_IDENTIFY = 2;
const GATEWAY_OP_RECONNECT = 7;
const GATEWAY_OP_INVALID_SESSION = 9;
const GATEWAY_OP_HELLO = 10;
const GATEWAY_READY_STATE_OPEN = 1;
const DISCORD_SNOWFLAKE_PATTERN = /^[0-9]{8,32}$/;

type FetchImpl = typeof fetch;

export interface DiscordBotOptions {
  token: string;
  applicationId: string;
  guildId: string | null;
  publicBaseUrl: string;
  apiBaseUrl: string;
  gatewayUrl: string;
  registerCommands: boolean;
  registerCommandsOnStart: boolean;
  priceReportMaxItems: number;
  commandCooldownSeconds: number;
  priceReportScheduleIntervalSeconds: number;
}

export type DiscordBotClient = PriceChangeDiscordClient &
  Pick<PrismaClient, "discordNotificationDelivery" | "discordPriceReportSetting">;

export interface DiscordBotEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordBotEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordBotEmbedField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
}

export interface DiscordBotMessage {
  content?: string;
  embeds?: DiscordBotEmbed[];
}

export type DiscordDirectMessageSendResult =
  | {
      status: "sent";
      messageCount: number;
      httpStatuses: number[];
    }
  | {
      status: "rate_limited";
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

export type DiscordBotMessageSendResult = DiscordDirectMessageSendResult;

export type PriceReportNowResult =
  | {
      status: "sent";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
    }
  | {
      status: "rate_limited";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

interface DiscordRestOptions {
  token: string;
  apiBaseUrl: string;
  fetchImpl?: FetchImpl;
}

type DiscordRestResult<T> =
  | {
      status: "ok";
      httpStatus: number;
      body: T | null;
    }
  | {
      status: "rate_limited";
      httpStatus: 429;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      httpStatus: number | null;
      message: string;
      retryAfterMs?: number;
    };

interface DiscordGatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

export interface DiscordInteraction {
  id: string;
  token: string;
  type: number;
  data?: {
    name?: string;
    options?: DiscordInteractionOption[];
  };
  member?: {
    user?: DiscordUser;
  };
  user?: DiscordUser;
}

interface DiscordInteractionOption {
  type: number;
  name: string;
  value?: unknown;
  options?: DiscordInteractionOption[];
}

interface DiscordUser {
  id: string;
}

interface DiscordDirectMessageChannel {
  id?: unknown;
}

interface MinimalWebSocketEvent {
  data?: unknown;
}

interface MinimalWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: MinimalWebSocketEvent) => void,
  ): void;
}

type MinimalWebSocketConstructor = new (url: string) => MinimalWebSocket;

interface ShutdownController {
  readonly requested: boolean;
  onStop(callback: () => void): void;
  sleep(ms: number): Promise<void>;
}

interface CommandCooldownResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

type ParsedPriceReportCommand =
  | {
      name: "now";
      windowHours: number;
      maxItems: number | null;
    }
  | {
      name: "enable";
      windowHours: number;
      maxItems: number | null;
    }
  | {
      name: "disable";
    }
  | {
      name: "settings";
    };

export function parseDiscordBotOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): DiscordBotOptions {
  return {
    token: readRequiredSecret(env, "DISCORD_BOT_TOKEN"),
    applicationId: readRequiredSnowflake(env, "DISCORD_APPLICATION_ID"),
    guildId: readOptionalSnowflake(env, "DISCORD_GUILD_ID"),
    publicBaseUrl: normalizePublicBaseUrl(
      env.PARTSRADAR_PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL,
    ),
    apiBaseUrl: normalizeHttpBaseUrl(
      env.DISCORD_API_BASE_URL ?? DEFAULT_DISCORD_API_BASE_URL,
      "DISCORD_API_BASE_URL",
    ),
    gatewayUrl: normalizeWebSocketUrl(
      env.DISCORD_GATEWAY_URL ?? DEFAULT_DISCORD_GATEWAY_URL,
      "DISCORD_GATEWAY_URL",
    ),
    registerCommands: args.includes("--register-commands"),
    registerCommandsOnStart: readBooleanEnv(env, "DISCORD_BOT_REGISTER_COMMANDS_ON_START", true),
    priceReportMaxItems: parseIntegerOption({
      args,
      env,
      argName: "--price-report-max-items",
      envName: "DISCORD_PRICE_REPORT_MAX_ITEMS",
      fallback: DEFAULT_PRICE_REPORT_MAX_ITEMS,
      min: 1,
      max: MAX_PRICE_REPORT_ITEMS,
    }),
    commandCooldownSeconds: parseIntegerOption({
      args,
      env,
      argName: "--command-cooldown-seconds",
      envName: "DISCORD_BOT_COMMAND_COOLDOWN_SECONDS",
      fallback: DEFAULT_COMMAND_COOLDOWN_SECONDS,
      min: 0,
      max: 3600,
    }),
    priceReportScheduleIntervalSeconds: parseIntegerOption({
      args,
      env,
      argName: "--price-report-schedule-interval-seconds",
      envName: "DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS",
      fallback: DEFAULT_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS,
      min: 60,
      max: 3600,
    }),
  };
}

export async function registerDiscordBotCommands({
  token,
  applicationId,
  guildId,
  apiBaseUrl,
  fetchImpl = fetch,
}: Pick<DiscordBotOptions, "token" | "applicationId" | "guildId" | "apiBaseUrl"> & {
  fetchImpl?: FetchImpl;
}): Promise<DiscordRestResult<unknown>> {
  const globalResult = await sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/commands`,
    body: [createPriceReportCommand({ includeDmContexts: true })],
  });

  if (globalResult.status !== "ok" || !guildId) {
    return globalResult;
  }

  const guildResult = await sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/guilds/${guildId}/commands`,
    body: [createPriceReportCommand({ includeDmContexts: false })],
  });

  return guildResult;
}

export async function sendPriceReportNow({
  client,
  discordUserId,
  windowHours,
  maxItems,
  publicBaseUrl,
  now = new Date(),
  sendReportMessages,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  publicBaseUrl: string;
  now?: Date;
  sendReportMessages: (messages: DiscordBotMessage[]) => Promise<DiscordBotMessageSendResult>;
}): Promise<PriceReportNowResult> {
  return sendPriceReport({
    client,
    discordUserId,
    windowHours,
    maxItems,
    publicBaseUrl,
    now,
    deliveryKind: "PRICE_REPORT_NOW",
    sendReportMessages,
  });
}

async function sendPriceReport({
  client,
  discordUserId,
  windowHours,
  maxItems,
  publicBaseUrl,
  now,
  deliveryKind,
  sendReportMessages,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  publicBaseUrl: string;
  now: Date;
  deliveryKind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT";
  sendReportMessages: (messages: DiscordBotMessage[]) => Promise<DiscordBotMessageSendResult>;
}): Promise<PriceReportNowResult> {
  const since = new Date(now.getTime() - windowHours * HOUR_MS);
  const boundedMaxItems = clampPriceReportMaxItems(maxItems);
  const report = await readRecentPriceReport(client, { since, until: now });
  const listedCount = Math.min(
    report.priceChanges.length + report.newProducts.length,
    boundedMaxItems,
  );
  const messages = createPersonalPriceReportEmbedMessages(report, {
    publicBaseUrl,
    maxItems: boundedMaxItems,
    windowHours,
    generatedAt: now,
  });
  const result = await sendReportMessages(messages);

  await recordPriceReportDelivery({
    client,
    discordUserId,
    kind: deliveryKind,
    status: result.status,
    itemCount: listedCount,
    messageCount: messages.length,
    deliveredAt: result.status === "sent" ? now : null,
    errorMessage: result.status === "failed" ? result.message : null,
  });

  if (result.status === "sent") {
    return {
      status: "sent",
      changeCount: report.priceChanges.length,
      newProductCount: report.newProducts.length,
      listedCount,
      messageCount: messages.length,
    };
  }

  if (result.status === "rate_limited") {
    return {
      status: "rate_limited",
      changeCount: report.priceChanges.length,
      newProductCount: report.newProducts.length,
      listedCount,
      messageCount: messages.length,
      sentMessageCount: result.sentMessageCount,
      retryAfterMs: result.retryAfterMs,
      global: result.global,
    };
  }

  return {
    status: "failed",
    changeCount: report.priceChanges.length,
    newProductCount: report.newProducts.length,
    listedCount,
    messageCount: messages.length,
    sentMessageCount: result.sentMessageCount,
    httpStatus: result.httpStatus,
    message: result.message,
  };
}

export async function sendDiscordDirectMessages({
  token,
  apiBaseUrl,
  userId,
  messages,
  fetchImpl = fetch,
}: {
  token: string;
  apiBaseUrl: string;
  userId: string;
  messages: DiscordBotMessage[];
  fetchImpl?: FetchImpl;
}): Promise<DiscordDirectMessageSendResult> {
  const channelResult = await sendDiscordRestRequest<DiscordDirectMessageChannel>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: "/users/@me/channels",
    body: {
      recipient_id: userId,
    },
  });

  if (channelResult.status === "rate_limited") {
    return {
      status: "rate_limited",
      messageCount: messages.length,
      sentMessageCount: 0,
      retryAfterMs: channelResult.retryAfterMs,
      global: channelResult.global,
    };
  }

  if (channelResult.status === "failed") {
    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: 0,
      httpStatus: channelResult.httpStatus,
      message: channelResult.message,
    };
  }

  const channelId = typeof channelResult.body?.id === "string" ? channelResult.body.id : null;

  if (!channelId) {
    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: 0,
      httpStatus: channelResult.httpStatus,
      message: "Discord API returned a DM channel without an id.",
    };
  }

  const httpStatuses: number[] = [];

  for (const message of messages) {
    const messageResult = await sendDiscordRestRequest<unknown>({
      token,
      apiBaseUrl,
      fetchImpl,
      method: "POST",
      path: `/channels/${channelId}/messages`,
      body: createDiscordMessagePayload(message),
    });

    if (messageResult.status === "ok") {
      httpStatuses.push(messageResult.httpStatus);
      continue;
    }

    if (messageResult.status === "rate_limited") {
      return {
        status: "rate_limited",
        messageCount: messages.length,
        sentMessageCount: httpStatuses.length,
        retryAfterMs: messageResult.retryAfterMs,
        global: messageResult.global,
      };
    }

    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: httpStatuses.length,
      httpStatus: messageResult.httpStatus,
      message: messageResult.message,
    };
  }

  return {
    status: "sent",
    messageCount: messages.length,
    httpStatuses,
  };
}

export async function sendDiscordInteractionMessages({
  token,
  applicationId,
  apiBaseUrl,
  interaction,
  messages,
  fetchImpl = fetch,
}: {
  token: string;
  applicationId: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  messages: DiscordBotMessage[];
  fetchImpl?: FetchImpl;
}): Promise<DiscordBotMessageSendResult> {
  const httpStatuses: number[] = [];

  for (const [index, message] of messages.entries()) {
    const path =
      index === 0
        ? `/webhooks/${applicationId}/${interaction.token}/messages/@original`
        : `/webhooks/${applicationId}/${interaction.token}`;
    const method = index === 0 ? "PATCH" : "POST";
    const messageResult = await sendDiscordRestRequest<unknown>({
      token,
      apiBaseUrl,
      fetchImpl,
      method,
      path,
      body: createDiscordMessagePayload(message),
    });

    if (messageResult.status === "ok") {
      httpStatuses.push(messageResult.httpStatus);
      continue;
    }

    if (messageResult.status === "rate_limited") {
      return {
        status: "rate_limited",
        messageCount: messages.length,
        sentMessageCount: httpStatuses.length,
        retryAfterMs: messageResult.retryAfterMs,
        global: messageResult.global,
      };
    }

    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: httpStatuses.length,
      httpStatus: messageResult.httpStatus,
      message: messageResult.message,
    };
  }

  return {
    status: "sent",
    messageCount: messages.length,
    httpStatuses,
  };
}

export async function enableDailyPriceReport({
  client,
  discordUserId,
  windowHours,
  maxItems,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  now?: Date;
}): Promise<DiscordPriceReportSetting> {
  return client.discordPriceReportSetting.upsert({
    where: {
      discordUserId,
    },
    create: {
      discordUserId,
      interval: "DAILY",
      window: toPriceReportWindow(windowHours),
      scope: "ALL",
      timezone: TIME_ZONE,
      maxItems: clampPriceReportMaxItems(maxItems),
      enabled: true,
      nextSendAt: calculateNextSendAt(now, "DAILY"),
    },
    update: {
      interval: "DAILY",
      window: toPriceReportWindow(windowHours),
      scope: "ALL",
      timezone: TIME_ZONE,
      maxItems: clampPriceReportMaxItems(maxItems),
      enabled: true,
      nextSendAt: calculateNextSendAt(now, "DAILY"),
    },
  });
}

export interface ScheduledPriceReportSummary {
  processedCount: number;
  sentCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

export async function sendDueScheduledPriceReports({
  client,
  options,
  now = new Date(),
  sendDirectMessages,
}: {
  client: DiscordBotClient;
  options: Pick<DiscordBotOptions, "publicBaseUrl" | "priceReportMaxItems">;
  now?: Date;
  sendDirectMessages: (
    discordUserId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<ScheduledPriceReportSummary> {
  const settings = await client.discordPriceReportSetting.findMany({
    where: {
      enabled: true,
      nextSendAt: {
        lte: now,
      },
    },
    orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
    take: MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE,
  });
  const summary: ScheduledPriceReportSummary = {
    processedCount: 0,
    sentCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  };

  for (const setting of settings) {
    summary.processedCount += 1;

    const result = await sendPriceReport({
      client,
      discordUserId: setting.discordUserId,
      windowHours: toWindowHours(setting.window),
      maxItems: clampPriceReportMaxItems(Math.min(setting.maxItems, options.priceReportMaxItems)),
      publicBaseUrl: options.publicBaseUrl,
      now,
      deliveryKind: "SCHEDULED_PRICE_REPORT",
      sendReportMessages: (messages) => sendDirectMessages(setting.discordUserId, messages),
    });

    if (result.status === "sent") {
      summary.sentCount += 1;
    } else if (result.status === "rate_limited") {
      summary.rateLimitedCount += 1;
    } else {
      summary.failedCount += 1;
    }

    await client.discordPriceReportSetting.update({
      where: {
        id: setting.id,
      },
      data: {
        lastSentAt: result.status === "sent" ? now : setting.lastSentAt,
        nextSendAt: calculateNextSendAt(now, setting.interval),
      },
    });
  }

  return summary;
}

async function disablePriceReport({
  client,
  discordUserId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<number> {
  const result = await client.discordPriceReportSetting.updateMany({
    where: {
      discordUserId,
      enabled: true,
    },
    data: {
      enabled: false,
      nextSendAt: null,
    },
  });

  return result.count;
}

async function readPriceReportSetting({
  client,
  discordUserId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<DiscordPriceReportSetting | null> {
  return client.discordPriceReportSetting.findUnique({
    where: {
      discordUserId,
    },
  });
}

export async function handleDiscordInteraction({
  client,
  interaction,
  options,
  cooldowns,
  fetchImpl = fetch,
}: {
  client: DiscordBotClient;
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  cooldowns: CommandCooldowns;
  fetchImpl?: FetchImpl;
}): Promise<void> {
  if (interaction.type !== DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND) {
    return;
  }

  const command = parsePriceReportInteraction(interaction);

  if (!command) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: "這個 PartsRadarTW bot 版本尚未支援此指令。",
    });
    return;
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;

  if (!discordUserId) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: "無法辨識這次指令的 Discord 使用者。",
    });
    return;
  }

  const cooldown = cooldowns.consume(discordUserId, new Date());

  if (!cooldown.allowed) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: `請等待 ${cooldown.retryAfterSeconds} 秒後再產生下一份價格報告。`,
    });
    return;
  }

  if (command.name === "now") {
    await deferInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
    });

    await sendPriceReportNow({
      client,
      discordUserId,
      windowHours: command.windowHours,
      maxItems: command.maxItems ?? options.priceReportMaxItems,
      publicBaseUrl: options.publicBaseUrl,
      sendReportMessages: (messages) =>
        sendDiscordInteractionMessages({
          token: options.token,
          applicationId: options.applicationId,
          apiBaseUrl: options.apiBaseUrl,
          interaction,
          messages,
          fetchImpl,
        }),
    });
    return;
  }

  if (command.name === "enable") {
    const setting = await enableDailyPriceReport({
      client,
      discordUserId,
      windowHours: command.windowHours,
      maxItems: command.maxItems ?? options.priceReportMaxItems,
    });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: `已開啟每日價格提醒。報告會以私訊發送，區間：${formatWindowLabel(setting.window)}，上限：${setting.maxItems} 筆，下一次：${formatTaipeiMinute(setting.nextSendAt)}。`,
    });
    return;
  }

  if (command.name === "disable") {
    const disabledCount = await disablePriceReport({ client, discordUserId });

    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: disabledCount > 0 ? "已關閉每日價格提醒。" : "目前沒有開啟每日價格提醒。",
    });
    return;
  }

  const setting = await readPriceReportSetting({ client, discordUserId });

  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: formatPriceReportSettingMessage(setting),
  });
}

export async function runDiscordBotDaemon({
  client,
  options,
  fetchImpl = fetch,
  WebSocketCtor = getWebSocketConstructor(),
  logMessage = log,
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  fetchImpl?: FetchImpl;
  WebSocketCtor?: MinimalWebSocketConstructor;
  logMessage?: (message: string) => void;
}): Promise<void> {
  if (options.registerCommands || options.registerCommandsOnStart) {
    const result = await registerDiscordBotCommands({
      token: options.token,
      applicationId: options.applicationId,
      guildId: options.guildId,
      apiBaseUrl: options.apiBaseUrl,
      fetchImpl,
    });

    if (result.status !== "ok") {
      throw new Error(`Discord command registration failed: ${formatDiscordRestFailure(result)}`);
    }

    logMessage(
      `Discord bot commands registered. scope=${options.guildId ? "global+guild" : "global"} httpStatus=${result.httpStatus}`,
    );

    if (options.registerCommands) {
      return;
    }
  }

  const shutdown = createShutdownController(logMessage);
  const cooldowns = new CommandCooldowns(options.commandCooldownSeconds);
  const scheduledReportLoop = runScheduledPriceReportLoop({
    client,
    options,
    shutdown,
    fetchImpl,
    logMessage,
  });

  logMessage("Discord bot daemon started.");

  while (!shutdown.requested) {
    await runGatewaySession({
      client,
      options,
      shutdown,
      cooldowns,
      fetchImpl,
      WebSocketCtor,
      logMessage,
    });

    if (!shutdown.requested) {
      logMessage("Discord gateway disconnected; reconnecting in 5s.");
      await shutdown.sleep(5000);
    }
  }

  await scheduledReportLoop;
  logMessage("Discord bot daemon stopped.");
}

async function runScheduledPriceReportLoop({
  client,
  options,
  shutdown,
  fetchImpl,
  logMessage,
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  shutdown: ShutdownController;
  fetchImpl: FetchImpl;
  logMessage: (message: string) => void;
}): Promise<void> {
  while (!shutdown.requested) {
    try {
      const summary = await sendDueScheduledPriceReports({
        client,
        options,
        sendDirectMessages: (discordUserId, messages) =>
          sendDiscordDirectMessages({
            token: options.token,
            apiBaseUrl: options.apiBaseUrl,
            userId: discordUserId,
            messages,
            fetchImpl,
          }),
      });

      if (summary.processedCount > 0) {
        logMessage(
          `Scheduled price reports processed. processed=${summary.processedCount} sent=${summary.sentCount} rateLimited=${summary.rateLimitedCount} failed=${summary.failedCount}`,
        );
      }
    } catch (error) {
      logMessage(`Scheduled price report loop failed: ${toSafeCliErrorMessage(error)}`);
    }

    await shutdown.sleep(options.priceReportScheduleIntervalSeconds * 1000);
  }
}

class CommandCooldowns {
  private readonly lastUsedAtByUser = new Map<string, number>();

  constructor(private readonly cooldownSeconds: number) {}

  consume(discordUserId: string, now: Date): CommandCooldownResult {
    if (this.cooldownSeconds <= 0) {
      return {
        allowed: true,
        retryAfterSeconds: 0,
      };
    }

    const lastUsedAt = this.lastUsedAtByUser.get(discordUserId);
    const nowMs = now.getTime();

    if (lastUsedAt !== undefined) {
      const elapsedSeconds = Math.floor((nowMs - lastUsedAt) / 1000);
      const retryAfterSeconds = this.cooldownSeconds - elapsedSeconds;

      if (retryAfterSeconds > 0) {
        return {
          allowed: false,
          retryAfterSeconds,
        };
      }
    }

    this.lastUsedAtByUser.set(discordUserId, nowMs);

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }
}

async function runGatewaySession({
  client,
  options,
  shutdown,
  cooldowns,
  fetchImpl,
  WebSocketCtor,
  logMessage,
}: {
  client: DiscordBotClient;
  options: DiscordBotOptions;
  shutdown: ShutdownController;
  cooldowns: CommandCooldowns;
  fetchImpl: FetchImpl;
  WebSocketCtor: MinimalWebSocketConstructor;
  logMessage: (message: string) => void;
}): Promise<void> {
  const socket = new WebSocketCtor(options.gatewayUrl);
  let sequence: number | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  shutdown.onStop(() => {
    socket.close(1000, "shutdown");
  });

  await new Promise<void>((resolve) => {
    socket.addEventListener("open", () => {
      logMessage("Discord gateway connected.");
    });

    socket.addEventListener("close", () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      resolve();
    });

    socket.addEventListener("error", () => {
      logMessage("Discord gateway socket error.");
    });

    socket.addEventListener("message", (event) => {
      const raw = readWebSocketMessageData(event);
      let payload: DiscordGatewayPayload;

      try {
        payload = JSON.parse(raw) as DiscordGatewayPayload;
      } catch {
        logMessage("Discord gateway sent an invalid JSON payload.");
        return;
      }

      if (typeof payload.s === "number") {
        sequence = payload.s;
      }

      if (payload.op === GATEWAY_OP_HELLO) {
        const heartbeatInterval = readHeartbeatInterval(payload.d);
        heartbeatTimer = setInterval(() => {
          sendGatewayPayload(socket, {
            op: GATEWAY_OP_HEARTBEAT,
            d: sequence,
          });
        }, heartbeatInterval);
        sendIdentifyPayload(socket, options.token);
        return;
      }

      if (payload.op === GATEWAY_OP_RECONNECT || payload.op === GATEWAY_OP_INVALID_SESSION) {
        socket.close(4000, "reconnect requested");
        return;
      }

      if (payload.op !== GATEWAY_OP_DISPATCH) {
        return;
      }

      if (payload.t === "READY") {
        logMessage("Discord bot ready.");
        return;
      }

      if (payload.t === "INTERACTION_CREATE") {
        void handleDiscordInteraction({
          client,
          interaction: payload.d as DiscordInteraction,
          options,
          cooldowns,
          fetchImpl,
        }).catch((error) => {
          logMessage(`Discord interaction handling failed: ${toSafeCliErrorMessage(error)}`);
        });
      }
    });
  });
}

async function recordPriceReportDelivery({
  client,
  discordUserId,
  kind,
  status,
  itemCount,
  messageCount,
  deliveredAt,
  errorMessage,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT";
  status: DiscordDirectMessageSendResult["status"];
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
}): Promise<void> {
  await client.discordNotificationDelivery.create({
    data: {
      discordUserId,
      kind,
      status: status === "sent" ? "SENT" : status === "rate_limited" ? "RATE_LIMITED" : "FAILED",
      itemCount,
      messageCount,
      deliveredAt,
      errorMessage,
    },
  });
}

function createPriceReportCommand({
  includeDmContexts,
}: {
  includeDmContexts: boolean;
}): Record<string, unknown> {
  return {
    name: "price-report",
    description: "Send PartsRadarTW price change reports.",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    ...(includeDmContexts
      ? {
          contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
          dm_permission: true,
        }
      : {}),
    options: [
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "now",
        description: "立即在目前頻道或私訊顯示價格報告。",
        options: [
          {
            type: DISCORD_OPTION_TYPE_STRING,
            name: "window",
            description: "報告統計區間。",
            required: false,
            choices: [
              { name: "過去 24 小時", value: "24h" },
              { name: "過去 12 小時", value: "12h" },
              { name: "過去 6 小時", value: "6h" },
            ],
          },
          {
            type: DISCORD_OPTION_TYPE_INTEGER,
            name: "max_items",
            description: "最多列出的商品數。",
            required: false,
            min_value: 1,
            max_value: MAX_PRICE_REPORT_ITEMS,
          },
        ],
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "enable",
        description: "開啟每日價格報告私訊。",
        options: [
          {
            type: DISCORD_OPTION_TYPE_STRING,
            name: "window",
            description: "每天報告要統計的時間區間。",
            required: false,
            choices: [
              { name: "過去 24 小時", value: "24h" },
              { name: "過去 12 小時", value: "12h" },
              { name: "過去 6 小時", value: "6h" },
            ],
          },
          {
            type: DISCORD_OPTION_TYPE_INTEGER,
            name: "max_items",
            description: "每天最多列出的商品數。",
            required: false,
            min_value: 1,
            max_value: MAX_PRICE_REPORT_ITEMS,
          },
        ],
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "disable",
        description: "關閉每日價格報告私訊。",
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "settings",
        description: "查看每日價格報告設定。",
      },
    ],
  };
}

function parsePriceReportInteraction(interaction: DiscordInteraction): ParsedPriceReportCommand | null {
  if (interaction.data?.name !== "price-report") {
    return null;
  }

  const subcommand = interaction.data.options?.find(
    (option) => option.type === DISCORD_OPTION_TYPE_SUBCOMMAND,
  );

  if (!subcommand) {
    return null;
  }

  const windowOption = subcommand.options?.find((option) => option.name === "window");
  const maxItemsOption = subcommand.options?.find((option) => option.name === "max_items");

  if (subcommand.name === "now" || subcommand.name === "enable") {
    return {
      name: subcommand.name,
      windowHours: parseWindowHours(windowOption?.value),
      maxItems: parseMaxItems(maxItemsOption?.value),
    };
  }

  if (subcommand.name === "disable" || subcommand.name === "settings") {
    return {
      name: subcommand.name,
    };
  }

  return null;
}

function parseWindowHours(value: unknown): number {
  if (value === "6h") {
    return 6;
  }

  if (value === "12h") {
    return 12;
  }

  return 24;
}

function parseMaxItems(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return null;
  }

  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}

function createPersonalPriceReportEmbedMessages(
  report: RecentPriceReport,
  options: {
    publicBaseUrl: string;
    maxItems: number;
    windowHours: number;
    generatedAt: Date;
  },
): DiscordBotMessage[] {
  const listedPriceChanges = report.priceChanges.slice(0, options.maxItems);
  const remainingItemLimit = Math.max(0, options.maxItems - listedPriceChanges.length);
  const listedNewProducts = report.newProducts.slice(0, remainingItemLimit);
  const hiddenPriceChangeCount = report.priceChanges.length - listedPriceChanges.length;
  const hiddenNewProductCount = report.newProducts.length - listedNewProducts.length;
  const fields = [
    ...createReportSectionFields({
      title: `價格變動 (${report.priceChanges.length})`,
      emptyText: "沒有價格變動。",
      lines: listedPriceChanges.map((change) =>
        formatPersonalPriceChangeEmbedLine(change, options.publicBaseUrl),
      ),
    }),
    ...createReportSectionFields({
      title: `新增商品 (${report.newProducts.length})`,
      emptyText: "沒有新增商品。",
      lines: listedNewProducts.map((product) =>
        formatNewProductEmbedLine(product, options.publicBaseUrl),
      ),
    }),
  ];
  const fieldChunks = chunkArray(fields, DISCORD_EMBED_MAX_FIELDS);
  const footer = formatHiddenReportFooter({
    hiddenPriceChangeCount,
    hiddenNewProductCount,
  });
  const chunks = fieldChunks.length > 0 ? fieldChunks : [[{ name: "價格報告", value: "沒有資料。" }]];

  return chunks.map((chunk, index) => ({
    embeds: [
      {
        title:
          chunks.length > 1
            ? `PartsRadarTW 價格報告 (${index + 1}/${chunks.length})`
            : "PartsRadarTW 價格報告",
        description: formatDiscordBotText(
          `過去 ${options.windowHours} 小時：價格變動 ${report.priceChanges.length}，新增商品 ${report.newProducts.length}`,
          DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
        ),
        color: DISCORD_EMBED_COLOR,
        fields: chunk,
        footer: footer ? { text: footer } : undefined,
        timestamp: options.generatedAt.toISOString(),
      },
    ],
  }));
}

function createReportSectionFields({
  title,
  emptyText,
  lines,
}: {
  title: string;
  emptyText: string;
  lines: string[];
}): DiscordBotEmbedField[] {
  if (lines.length === 0) {
    return [
      {
        name: title,
        value: emptyText,
      },
    ];
  }

  return chunkFieldValueLines(lines).map((value, index) => ({
    name: index === 0 ? title : `${title} 續`,
    value,
  }));
}

function chunkFieldValueLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;

    if (current && next.length > DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH) {
      chunks.push(current);
      current = line;
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function formatPersonalPriceChangeEmbedLine(
  change: PriceChangeDiscordNotificationItem,
  publicBaseUrl: string,
): string {
  const productName = escapeMarkdownLinkText(
    formatDiscordBotText(toSingleLine(change.productName), PRODUCT_NAME_MAX_LENGTH),
  );
  const productUrl = createProductUrl(publicBaseUrl, change.productId);

  return formatDiscordBotText(
    `- [${productName}](${productUrl}) ${formatTaiwanDollar(
      change.previousPrice,
      change.currency,
    )} -> ${formatTaiwanDollar(change.currentPrice, change.currency)} (${formatSignedTaiwanDollar(
      change.delta,
      change.currency,
    )})`,
    280,
  );
}

function formatNewProductEmbedLine(
  product: PriceReportNewProductItem,
  publicBaseUrl: string,
): string {
  const productName = escapeMarkdownLinkText(
    formatDiscordBotText(toSingleLine(product.productName), PRODUCT_NAME_MAX_LENGTH),
  );
  const productUrl = createProductUrl(publicBaseUrl, product.productId);

  return formatDiscordBotText(
    `- [${productName}](${productUrl}) ${formatTaiwanDollar(product.currentPrice, product.currency)}`,
    240,
  );
}

async function sendInteractionResponse({
  token,
  apiBaseUrl,
  interaction,
  fetchImpl,
  content,
}: {
  token: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
  content: string;
}): Promise<void> {
  await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: `/interactions/${interaction.id}/${interaction.token}/callback`,
    body: {
      type: DISCORD_INTERACTION_CALLBACK_CHANNEL_MESSAGE,
      data: createDiscordMessagePayload(content, true),
    },
  });
}

async function deferInteractionResponse({
  token,
  apiBaseUrl,
  interaction,
  fetchImpl,
  ephemeral = false,
}: {
  token: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
  ephemeral?: boolean;
}): Promise<void> {
  await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: `/interactions/${interaction.id}/${interaction.token}/callback`,
    body: {
      type: DISCORD_INTERACTION_CALLBACK_DEFERRED_CHANNEL_MESSAGE,
      data: ephemeral ? { flags: DISCORD_EPHEMERAL_MESSAGE_FLAG } : undefined,
    },
  });
}

function createDiscordMessagePayload(
  message: DiscordBotMessage | string,
  ephemeral = false,
): Record<string, unknown> {
  const normalizedMessage = normalizeDiscordBotMessage(message);

  return {
    content: normalizedMessage.content,
    embeds: normalizedMessage.embeds,
    flags: ephemeral ? DISCORD_EPHEMERAL_MESSAGE_FLAG : undefined,
    allowed_mentions: {
      parse: [],
    },
  };
}

function normalizeDiscordBotMessage(message: DiscordBotMessage | string): DiscordBotMessage {
  if (typeof message === "string") {
    return {
      content: formatDiscordBotText(message, DISCORD_MESSAGE_CONTENT_MAX_LENGTH),
    };
  }

  const content =
    typeof message.content === "string"
      ? formatDiscordBotText(message.content, DISCORD_MESSAGE_CONTENT_MAX_LENGTH)
      : undefined;
  const embeds = message.embeds?.map(normalizeDiscordBotEmbed).filter((embed) => {
    return Boolean(embed.title || embed.description || (embed.fields && embed.fields.length > 0));
  });

  if (!content && (!embeds || embeds.length === 0)) {
    return {
      content: "價格報告目前沒有可顯示內容。",
    };
  }

  return {
    content,
    embeds: embeds && embeds.length > 0 ? embeds : undefined,
  };
}

function normalizeDiscordBotEmbed(embed: DiscordBotEmbed): DiscordBotEmbed {
  return {
    title:
      typeof embed.title === "string"
        ? formatDiscordBotText(embed.title, DISCORD_EMBED_TITLE_MAX_LENGTH)
        : undefined,
    description:
      typeof embed.description === "string"
        ? formatDiscordBotText(embed.description, DISCORD_EMBED_DESCRIPTION_MAX_LENGTH)
        : undefined,
    color: typeof embed.color === "number" ? embed.color : undefined,
    fields: embed.fields?.slice(0, DISCORD_EMBED_MAX_FIELDS).map((field) => ({
      name: formatDiscordBotText(field.name, DISCORD_EMBED_TITLE_MAX_LENGTH),
      value: formatDiscordBotText(field.value, DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH),
      inline: field.inline,
    })),
    footer: embed.footer
      ? {
          text: formatDiscordBotText(embed.footer.text, DISCORD_EMBED_FOOTER_TEXT_MAX_LENGTH),
        }
      : undefined,
    timestamp: embed.timestamp,
  };
}

async function sendDiscordRestRequest<T>({
  token,
  apiBaseUrl,
  fetchImpl = fetch,
  method,
  path,
  body,
}: DiscordRestOptions & {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
}): Promise<DiscordRestResult<T>> {
  try {
    const response = await fetchImpl(createDiscordApiUrl(apiBaseUrl, path), {
      method,
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
        "user-agent": "PartsRadarTW Discord bot (+https://github.com/C6Yelan/PartsRadarTW)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 429) {
      const rateLimitBody = await readDiscordJson<{
        retry_after?: unknown;
        global?: unknown;
      }>(response);
      const retryAfterMs =
        parseRetryAfterHeader(response.headers) ?? resolveRetryAfterMsFromBody(rateLimitBody);

      return {
        status: "rate_limited",
        httpStatus: 429,
        retryAfterMs,
        global: rateLimitBody?.global === true,
      };
    }

    if (!response.ok) {
      return {
        status: "failed",
        httpStatus: response.status,
        message: `Discord API returned HTTP ${response.status}.`,
        retryAfterMs: parseRetryAfterHeader(response.headers),
      };
    }

    return {
      status: "ok",
      httpStatus: response.status,
      body: await readDiscordJson<T>(response),
    };
  } catch (error) {
    return {
      status: "failed",
      httpStatus: null,
      message: toSafeCliErrorMessage(error),
    };
  }
}

async function readDiscordJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function resolveRetryAfterMsFromBody(body: { retry_after?: unknown } | null): number {
  const retryAfter = typeof body?.retry_after === "number" ? body.retry_after : null;

  return retryAfter !== null && Number.isFinite(retryAfter) ? Math.ceil(retryAfter * 1000) : 0;
}

function parseRetryAfterHeader(headers: Headers): number | undefined {
  const retryAfter = headers.get("retry-after");

  if (!retryAfter) {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfter);

  return Number.isFinite(retryAfterSeconds) ? Math.ceil(retryAfterSeconds * 1000) : undefined;
}

function sendIdentifyPayload(socket: MinimalWebSocket, token: string): void {
  sendGatewayPayload(socket, {
    op: GATEWAY_OP_IDENTIFY,
    d: {
      token,
      intents: 0,
      properties: {
        os: process.platform,
        browser: "PartsRadarTW",
        device: "PartsRadarTW",
      },
    },
  });
}

function sendGatewayPayload(socket: MinimalWebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === GATEWAY_READY_STATE_OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function readHeartbeatInterval(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "heartbeat_interval" in value &&
    typeof value.heartbeat_interval === "number" &&
    Number.isFinite(value.heartbeat_interval)
  ) {
    return Math.max(value.heartbeat_interval, 1000);
  }

  return 45_000;
}

function readWebSocketMessageData(event: { data?: unknown }): string {
  if (typeof event.data === "string") {
    return event.data;
  }

  if (event.data instanceof ArrayBuffer) {
    return Buffer.from(event.data).toString("utf8");
  }

  if (Buffer.isBuffer(event.data)) {
    return event.data.toString("utf8");
  }

  return String(event.data ?? "");
}

function getWebSocketConstructor(): MinimalWebSocketConstructor {
  const WebSocketConstructor = (globalThis as { WebSocket?: MinimalWebSocketConstructor })
    .WebSocket;

  if (!WebSocketConstructor) {
    throw new Error("Global WebSocket is not available in this Node.js runtime.");
  }

  return WebSocketConstructor;
}

function createShutdownController(logMessage: (message: string) => void): ShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;
  const stopCallbacks = new Set<() => void>();

  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      logMessage(`Received ${signal}; stopping Discord bot daemon.`);
    }

    stopRequested = true;
    wakeSleeper?.();

    for (const callback of stopCallbacks) {
      callback();
    }
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  return {
    get requested() {
      return stopRequested;
    },
    onStop(callback) {
      stopCallbacks.add(callback);
    },
    sleep(ms) {
      if (stopRequested) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeout);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}

function readRequiredSecret(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();

  if (!value || value.startsWith("replace_with_")) {
    throw new Error(`${key} is required for Discord bot commands.`);
  }

  return value;
}

function readRequiredSnowflake(env: NodeJS.ProcessEnv, key: string): string {
  const value = readRequiredSecret(env, key);

  if (!DISCORD_SNOWFLAKE_PATTERN.test(value)) {
    throw new Error(`${key} must be a Discord snowflake id.`);
  }

  return value;
}

function readOptionalSnowflake(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key]?.trim();

  if (!value || value.startsWith("replace_with_")) {
    return null;
  }

  if (!DISCORD_SNOWFLAKE_PATTERN.test(value)) {
    throw new Error(`${key} must be a Discord snowflake id.`);
  }

  return value;
}

function readBooleanEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const value = env[key]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (value === "true" || value === "1" || value === "yes") {
    return true;
  }

  if (value === "false" || value === "0" || value === "no") {
    return false;
  }

  throw new Error(`${key} must be true or false.`);
}

function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = getStringArg(args, argName) ?? env[envName] ?? String(fallback);
  const message = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}

function normalizeHttpBaseUrl(value: string, label: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");

  return url.toString();
}

function normalizeWebSocketUrl(value: string, label: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid ws(s) URL.`);
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`${label} must be a valid ws(s) URL.`);
  }

  url.hash = "";

  return url.toString();
}

function createDiscordApiUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
}

function formatDiscordRestFailure(
  result: Exclude<DiscordRestResult<unknown>, { status: "ok" }>,
): string {
  if (result.status === "rate_limited") {
    return `rate_limited retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`;
  }

  return `failed httpStatus=${result.httpStatus ?? "none"} message=${toSafeCliErrorMessage(
    result.message,
  )}`;
}

function calculateNextSendAt(now: Date, interval: DiscordPriceReportSetting["interval"]): Date {
  const intervalMs =
    interval === "EVERY_6H" ? 6 * HOUR_MS : interval === "EVERY_12H" ? 12 * HOUR_MS : DAY_MS;

  return new Date(now.getTime() + intervalMs);
}

function toPriceReportWindow(windowHours: number): DiscordPriceReportSetting["window"] {
  if (windowHours === 6) {
    return "HOURS_6";
  }

  if (windowHours === 12) {
    return "HOURS_12";
  }

  return "HOURS_24";
}

function toWindowHours(window: DiscordPriceReportSetting["window"]): number {
  if (window === "HOURS_6") {
    return 6;
  }

  if (window === "HOURS_12") {
    return 12;
  }

  return 24;
}

function clampPriceReportMaxItems(value: number): number {
  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}

function formatPriceReportSettingMessage(setting: DiscordPriceReportSetting | null): string {
  if (!setting?.enabled) {
    return "尚未開啟每日價格提醒。使用 `/price-report enable` 可開啟每日私訊報告。";
  }

  return [
    "每日價格提醒已開啟。",
    `統計區間：${formatWindowLabel(setting.window)}`,
    `每次最多：${setting.maxItems} 筆`,
    `下一次：${formatTaipeiMinute(setting.nextSendAt)}`,
  ].join("\n");
}

function formatWindowLabel(window: DiscordPriceReportSetting["window"]): string {
  return `過去 ${toWindowHours(window)} 小時`;
}

function formatTaipeiMinute(value: Date | null): string {
  if (!value) {
    return "尚未排程";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("month")}/${byType.get("day")} ${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}

function formatTaiwanDollar(amount: number, currency: string): string {
  if (currency === "TWD") {
    return `NT$${amount.toLocaleString("en-US")}`;
  }

  return `${currency} ${amount.toLocaleString("en-US")}`;
}

function formatSignedTaiwanDollar(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : "-";

  return `${sign}${formatTaiwanDollar(Math.abs(amount), currency)}`;
}

function formatHiddenReportFooter({
  hiddenPriceChangeCount,
  hiddenNewProductCount,
}: {
  hiddenPriceChangeCount: number;
  hiddenNewProductCount: number;
}): string | null {
  const parts = [
    hiddenPriceChangeCount > 0 ? `另有 ${hiddenPriceChangeCount} 筆價格變動未列出` : null,
    hiddenNewProductCount > 0 ? `另有 ${hiddenNewProductCount} 個新增商品未列出` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join("，") : null;
}

function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function formatDiscordBotText(value: string, maxLength: number): string {
  const text = replaceControlCharacters(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    const isControlCharacter = (code >= 0 && code <= 31) || code === 127;

    return isControlCharacter && !isAllowedWhitespace ? " " : character;
  }).join("");
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:discord-bot -- [options]

Options:
  --register-commands         Register slash commands and exit.
  --price-report-max-items <n>
                              Maximum rows in price report messages.
                              Default: ${DEFAULT_PRICE_REPORT_MAX_ITEMS}, range: 1-${MAX_PRICE_REPORT_ITEMS}
  --command-cooldown-seconds <sec>
                              Per-user cooldown for bot commands.
                              Default: ${DEFAULT_COMMAND_COOLDOWN_SECONDS}, range: 0-3600
  --price-report-schedule-interval-seconds <sec>
                              Delay between scheduled price report checks.
                              Default: ${DEFAULT_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS}, range: 60-3600

Environment:
  DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID,
  DISCORD_BOT_REGISTER_COMMANDS_ON_START, DISCORD_PRICE_REPORT_MAX_ITEMS,
  DISCORD_BOT_COMMAND_COOLDOWN_SECONDS, DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS,
  PARTSRADAR_PUBLIC_BASE_URL
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseDiscordBotOptions(args);

  if (options.registerCommands) {
    const result = await registerDiscordBotCommands(options);

    if (result.status !== "ok") {
      throw new Error(`Discord command registration failed: ${formatDiscordRestFailure(result)}`);
    }

    log(
      `Discord bot commands registered. scope=${options.guildId ? "global+guild" : "global"} httpStatus=${result.httpStatus}`,
    );
    return;
  }

  const db = await import("@partsradar/db");
  const client = db.prisma;

  try {
    await runDiscordBotDaemon({
      client,
      options,
    });
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
