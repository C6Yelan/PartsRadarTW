// apps/crawler/src/scripts/ops/discord-webhook.ts

import {
  formatDiscordWebhookText,
  sanitizeDiscordTransportErrorMessage,
} from "./discord-webhook/text";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_USER_AGENT =
  "PartsRadarTW Discord webhook (+https://github.com/C6Yelan/PartsRadarTW)";
const DISCORD_CONTENT_MAX_LENGTH = 2000;
const DISCORD_FIELD_NAME_MAX_LENGTH = 256;
const DISCORD_FIELD_VALUE_MAX_LENGTH = 1024;
const DISCORD_WEBHOOK_PATH_PATTERN = /^\/api\/webhooks\/[0-9]+\/[A-Za-z0-9._-]+\/?$/;

export { formatDiscordWebhookText } from "./discord-webhook/text";

export interface DiscordWebhookEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordWebhookEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordWebhookEmbedField[];
  timestamp?: string;
}

export interface DiscordWebhookMessage {
  content?: string;
  username?: string;
  avatarUrl?: string;
  embeds?: DiscordWebhookEmbed[];
}

export interface DiscordWebhookSendOptions {
  webhookUrl: string | null | undefined;
  message: DiscordWebhookMessage;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type DiscordWebhookSendResult =
  | {
      status: "skipped";
      reason: "missing_webhook_url";
    }
  | {
      status: "sent";
      httpStatus: number;
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

interface DiscordRateLimitBody {
  retry_after?: unknown;
  global?: unknown;
}

interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: DiscordWebhookEmbedField[];
    timestamp?: string;
  }>;
  allowed_mentions: {
    parse: [];
  };
}

type DiscordWebhookPayloadEmbed = NonNullable<DiscordWebhookPayload["embeds"]>[number];

export function readDiscordWebhookUrl(
  env: NodeJS.ProcessEnv,
  key: "DISCORD_ADMIN_WEBHOOK_URL",
): string | null {
  const value = env[key]?.trim();

  if (!value || value.startsWith("replace_with_")) {
    return null;
  }

  return normalizeDiscordWebhookUrl(value, key);
}

export function normalizeDiscordWebhookUrl(value: string, label = "Discord webhook URL"): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid Discord webhook URL.`);
  }

  if (
    url.protocol !== "https:" ||
    !["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"].includes(
      url.hostname,
    ) ||
    !DISCORD_WEBHOOK_PATH_PATTERN.test(url.pathname)
  ) {
    throw new Error(`${label} must be a valid Discord webhook URL.`);
  }

  url.hash = "";
  return url.toString();
}

export async function sendDiscordWebhookMessage({
  webhookUrl,
  message,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}: DiscordWebhookSendOptions): Promise<DiscordWebhookSendResult> {
  if (!webhookUrl?.trim()) {
    return {
      status: "skipped",
      reason: "missing_webhook_url",
    };
  }

  const normalizedWebhookUrl = normalizeDiscordWebhookUrl(webhookUrl);
  const payload = toDiscordWebhookPayload(message);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(normalizedWebhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": DEFAULT_USER_AGENT,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      const retryAfterMs = await resolveRetryAfterMs(response);
      const body = await readRateLimitBody(response);

      return {
        status: "rate_limited",
        httpStatus: 429,
        retryAfterMs,
        global: body?.global === true,
      };
    }

    if (!response.ok) {
      return {
        status: "failed",
        httpStatus: response.status,
        message: `Discord webhook returned HTTP ${response.status}.`,
        retryAfterMs: parseRetryAfterHeader(response.headers),
      };
    }

    return {
      status: "sent",
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      status: "failed",
      httpStatus: null,
      message: sanitizeDiscordTransportErrorMessage(
        error instanceof Error ? error.message : String(error),
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toDiscordWebhookPayload(message: DiscordWebhookMessage): DiscordWebhookPayload {
  const content = message.content
    ? formatDiscordWebhookText(message.content, DISCORD_CONTENT_MAX_LENGTH).trim()
    : undefined;
  const embeds = message.embeds?.map(toDiscordEmbed).filter(hasDiscordEmbedContent);

  if (!content && (!embeds || embeds.length === 0)) {
    throw new Error("Discord webhook message must include content or at least one embed.");
  }

  return {
    content,
    username: message.username ? formatDiscordWebhookText(message.username, 80).trim() : undefined,
    avatar_url: message.avatarUrl,
    embeds,
    allowed_mentions: {
      parse: [],
    },
  };
}

function toDiscordEmbed(embed: DiscordWebhookEmbed): DiscordWebhookPayloadEmbed {
  return {
    title: embed.title ? formatDiscordWebhookText(embed.title, 256).trim() : undefined,
    description: embed.description
      ? formatDiscordWebhookText(embed.description).trim()
      : undefined,
    color: embed.color,
    fields: embed.fields?.map((field) => ({
      name: formatDiscordWebhookText(field.name, DISCORD_FIELD_NAME_MAX_LENGTH).trim(),
      value: formatDiscordWebhookText(field.value, DISCORD_FIELD_VALUE_MAX_LENGTH).trim(),
      inline: field.inline,
    })),
    timestamp: embed.timestamp,
  };
}

function hasDiscordEmbedContent(embed: DiscordWebhookPayloadEmbed): boolean {
  return Boolean(embed.title || embed.description || (embed.fields && embed.fields.length > 0));
}

async function resolveRetryAfterMs(response: Response): Promise<number> {
  const headerRetryAfterMs = parseRetryAfterHeader(response.headers);

  if (headerRetryAfterMs !== undefined) {
    return headerRetryAfterMs;
  }

  const body = await readRateLimitBody(response);
  const retryAfter = typeof body?.retry_after === "number" ? body.retry_after : null;

  return retryAfter !== null && Number.isFinite(retryAfter) ? Math.ceil(retryAfter * 1000) : 0;
}

function parseRetryAfterHeader(headers: Headers): number | undefined {
  const retryAfter = headers.get("retry-after");

  if (!retryAfter) {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfter);

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return undefined;
  }

  return Math.ceil(retryAfterSeconds * 1000);
}

async function readRateLimitBody(response: Response): Promise<DiscordRateLimitBody | null> {
  try {
    const body = (await response.clone().json()) as DiscordRateLimitBody;
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}
