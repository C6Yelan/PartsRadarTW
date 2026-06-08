// apps/crawler/src/scripts/ops/discord-bot.ts
import type { PrismaClient } from "@partsradar/db";
import {
  createPriceChangeReportMessages,
  normalizePublicBaseUrl,
  readRecentPriceChanges,
  type PriceChangeDiscordClient,
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
const HOUR_MS = 60 * 60 * 1000;
const DISCORD_EPHEMERAL_MESSAGE_FLAG = 64;
const DISCORD_COMMAND_TYPE_CHAT_INPUT = 1;
const DISCORD_OPTION_TYPE_SUBCOMMAND = 1;
const DISCORD_OPTION_TYPE_STRING = 3;
const DISCORD_OPTION_TYPE_INTEGER = 4;
const DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const DISCORD_INTERACTION_CALLBACK_CHANNEL_MESSAGE = 4;
const DISCORD_INTERACTION_CALLBACK_DEFERRED_CHANNEL_MESSAGE = 5;
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
}

export type DiscordBotClient = PriceChangeDiscordClient &
  Pick<PrismaClient, "discordNotificationDelivery">;

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

export type PriceReportNowResult =
  | {
      status: "sent";
      changeCount: number;
      listedCount: number;
      messageCount: number;
    }
  | {
      status: "rate_limited";
      changeCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      changeCount: number;
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

interface DiscordInteraction {
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
  const path = guildId
    ? `/applications/${applicationId}/guilds/${guildId}/commands`
    : `/applications/${applicationId}/commands`;

  return sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path,
    body: [createPriceReportCommand()],
  });
}

export async function sendPriceReportNow({
  client,
  discordUserId,
  windowHours,
  maxItems,
  publicBaseUrl,
  now = new Date(),
  sendDirectMessages,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  publicBaseUrl: string;
  now?: Date;
  sendDirectMessages: (
    userId: string,
    contents: string[],
  ) => Promise<DiscordDirectMessageSendResult>;
}): Promise<PriceReportNowResult> {
  const since = new Date(now.getTime() - windowHours * HOUR_MS);
  const changes = await readRecentPriceChanges(client, { since, until: now });
  const listedCount = Math.min(changes.length, maxItems);
  const contents = createPriceChangeReportMessages(changes, {
    publicBaseUrl,
    maxItems,
    title: `PartsRadarTW price report - past ${windowHours}h`,
    browseLabel: "Open PartsRadarTW",
    emptyMessage: [
      `PartsRadarTW price report - past ${windowHours}h`,
      "No price changes found.",
      `Open PartsRadarTW: ${new URL("/", publicBaseUrl).toString()}`,
    ].join("\n"),
  });
  const result = await sendDirectMessages(discordUserId, contents);

  await recordPriceReportDelivery({
    client,
    discordUserId,
    status: result.status,
    itemCount: listedCount,
    messageCount: contents.length,
    deliveredAt: result.status === "sent" ? now : null,
    errorMessage: result.status === "failed" ? result.message : null,
  });

  if (result.status === "sent") {
    return {
      status: "sent",
      changeCount: changes.length,
      listedCount,
      messageCount: contents.length,
    };
  }

  if (result.status === "rate_limited") {
    return {
      status: "rate_limited",
      changeCount: changes.length,
      listedCount,
      messageCount: contents.length,
      sentMessageCount: result.sentMessageCount,
      retryAfterMs: result.retryAfterMs,
      global: result.global,
    };
  }

  return {
    status: "failed",
    changeCount: changes.length,
    listedCount,
    messageCount: contents.length,
    sentMessageCount: result.sentMessageCount,
    httpStatus: result.httpStatus,
    message: result.message,
  };
}

export async function sendDiscordDirectMessages({
  token,
  apiBaseUrl,
  userId,
  contents,
  fetchImpl = fetch,
}: {
  token: string;
  apiBaseUrl: string;
  userId: string;
  contents: string[];
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
      messageCount: contents.length,
      sentMessageCount: 0,
      retryAfterMs: channelResult.retryAfterMs,
      global: channelResult.global,
    };
  }

  if (channelResult.status === "failed") {
    return {
      status: "failed",
      messageCount: contents.length,
      sentMessageCount: 0,
      httpStatus: channelResult.httpStatus,
      message: channelResult.message,
    };
  }

  const channelId = typeof channelResult.body?.id === "string" ? channelResult.body.id : null;

  if (!channelId) {
    return {
      status: "failed",
      messageCount: contents.length,
      sentMessageCount: 0,
      httpStatus: channelResult.httpStatus,
      message: "Discord API returned a DM channel without an id.",
    };
  }

  const httpStatuses: number[] = [];

  for (const content of contents) {
    const messageResult = await sendDiscordRestRequest<unknown>({
      token,
      apiBaseUrl,
      fetchImpl,
      method: "POST",
      path: `/channels/${channelId}/messages`,
      body: createDiscordMessagePayload(content),
    });

    if (messageResult.status === "ok") {
      httpStatuses.push(messageResult.httpStatus);
      continue;
    }

    if (messageResult.status === "rate_limited") {
      return {
        status: "rate_limited",
        messageCount: contents.length,
        sentMessageCount: httpStatuses.length,
        retryAfterMs: messageResult.retryAfterMs,
        global: messageResult.global,
      };
    }

    return {
      status: "failed",
      messageCount: contents.length,
      sentMessageCount: httpStatuses.length,
      httpStatus: messageResult.httpStatus,
      message: messageResult.message,
    };
  }

  return {
    status: "sent",
    messageCount: contents.length,
    httpStatuses,
  };
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

  const command = parsePriceReportNowInteraction(interaction);

  if (!command) {
    await sendInteractionResponse({
      token: options.token,
      apiBaseUrl: options.apiBaseUrl,
      interaction,
      fetchImpl,
      content: "This command is not supported by this PartsRadarTW bot version.",
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
      content: "Unable to resolve the Discord user for this command.",
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
      content: `Please wait ${cooldown.retryAfterSeconds}s before requesting another price report.`,
    });
    return;
  }

  await deferInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
  });

  const result = await sendPriceReportNow({
    client,
    discordUserId,
    windowHours: command.windowHours,
    maxItems: command.maxItems ?? options.priceReportMaxItems,
    publicBaseUrl: options.publicBaseUrl,
    sendDirectMessages: (userId, contents) =>
      sendDiscordDirectMessages({
        token: options.token,
        apiBaseUrl: options.apiBaseUrl,
        userId,
        contents,
        fetchImpl,
      }),
  });

  await editInteractionResponse({
    token: options.token,
    applicationId: options.applicationId,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: formatPriceReportNowInteractionResult(result),
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
      `Discord bot commands registered. scope=${options.guildId ? "guild" : "global"} httpStatus=${result.httpStatus}`,
    );

    if (options.registerCommands) {
      return;
    }
  }

  const shutdown = createShutdownController(logMessage);
  const cooldowns = new CommandCooldowns(options.commandCooldownSeconds);

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

  logMessage("Discord bot daemon stopped.");
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
  status,
  itemCount,
  messageCount,
  deliveredAt,
  errorMessage,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  status: DiscordDirectMessageSendResult["status"];
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
}): Promise<void> {
  await client.discordNotificationDelivery.create({
    data: {
      discordUserId,
      kind: "PRICE_REPORT_NOW",
      status: status === "sent" ? "SENT" : status === "rate_limited" ? "RATE_LIMITED" : "FAILED",
      itemCount,
      messageCount,
      deliveredAt,
      errorMessage,
    },
  });
}

function createPriceReportCommand(): Record<string, unknown> {
  return {
    name: "price-report",
    description: "Send PartsRadarTW price change reports.",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    options: [
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "now",
        description: "Send a price change report by DM now.",
        options: [
          {
            type: DISCORD_OPTION_TYPE_STRING,
            name: "window",
            description: "Time window to include.",
            required: false,
            choices: [
              { name: "past 24 hours", value: "24h" },
              { name: "past 12 hours", value: "12h" },
              { name: "past 6 hours", value: "6h" },
            ],
          },
          {
            type: DISCORD_OPTION_TYPE_INTEGER,
            name: "max_items",
            description: "Maximum changed products to list.",
            required: false,
            min_value: 1,
            max_value: MAX_PRICE_REPORT_ITEMS,
          },
        ],
      },
    ],
  };
}

function parsePriceReportNowInteraction(
  interaction: DiscordInteraction,
): { windowHours: number; maxItems: number | null } | null {
  if (interaction.data?.name !== "price-report") {
    return null;
  }

  const subcommand = interaction.data.options?.find(
    (option) => option.type === DISCORD_OPTION_TYPE_SUBCOMMAND,
  );

  if (subcommand?.name !== "now") {
    return null;
  }

  const windowOption = subcommand.options?.find((option) => option.name === "window");
  const maxItemsOption = subcommand.options?.find((option) => option.name === "max_items");

  return {
    windowHours: parseWindowHours(windowOption?.value),
    maxItems: parseMaxItems(maxItemsOption?.value),
  };
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
}: {
  token: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
}): Promise<void> {
  await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: `/interactions/${interaction.id}/${interaction.token}/callback`,
    body: {
      type: DISCORD_INTERACTION_CALLBACK_DEFERRED_CHANNEL_MESSAGE,
      data: {
        flags: DISCORD_EPHEMERAL_MESSAGE_FLAG,
      },
    },
  });
}

async function editInteractionResponse({
  token,
  applicationId,
  apiBaseUrl,
  interaction,
  fetchImpl,
  content,
}: {
  token: string;
  applicationId: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
  content: string;
}): Promise<void> {
  await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PATCH",
    path: `/webhooks/${applicationId}/${interaction.token}/messages/@original`,
    body: createDiscordMessagePayload(content, true),
  });
}

function formatPriceReportNowInteractionResult(result: PriceReportNowResult): string {
  if (result.status === "sent") {
    return `Price report sent by DM. changes=${result.changeCount} listed=${result.listedCount} messages=${result.messageCount}`;
  }

  if (result.status === "rate_limited") {
    return `Discord rate limited the DM request. sentMessages=${result.sentMessageCount}/${result.messageCount} retryAfterMs=${result.retryAfterMs}`;
  }

  return `Unable to send the DM price report. sentMessages=${result.sentMessageCount}/${result.messageCount} httpStatus=${result.httpStatus ?? "none"}`;
}

function createDiscordMessagePayload(content: string, ephemeral = false): Record<string, unknown> {
  return {
    content: formatDiscordBotText(content, 2000),
    flags: ephemeral ? DISCORD_EPHEMERAL_MESSAGE_FLAG : undefined,
    allowed_mentions: {
      parse: [],
    },
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
                              Maximum rows in /price-report now DMs.
                              Default: ${DEFAULT_PRICE_REPORT_MAX_ITEMS}, range: 1-${MAX_PRICE_REPORT_ITEMS}
  --command-cooldown-seconds <sec>
                              Per-user cooldown for bot commands.
                              Default: ${DEFAULT_COMMAND_COOLDOWN_SECONDS}, range: 0-3600

Environment:
  DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID,
  DISCORD_BOT_REGISTER_COMMANDS_ON_START, DISCORD_PRICE_REPORT_MAX_ITEMS,
  DISCORD_BOT_COMMAND_COOLDOWN_SECONDS, PARTSRADAR_PUBLIC_BASE_URL
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
      `Discord bot commands registered. scope=${options.guildId ? "guild" : "global"} httpStatus=${result.httpStatus}`,
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
