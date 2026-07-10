// apps/crawler/src/scripts/ops/discord-webhook.ts
// 提供 Discord admin webhook 的安全傳送工具，集中 URL 驗證、payload 限制、rate limit 與錯誤遮蔽。

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

// Discord webhook embed 欄位 contract，只保留目前 admin 通知實際使用的欄位。
export interface DiscordWebhookEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

// Discord webhook embed contract，供 smoke admin notification 組裝告警內容。
export interface DiscordWebhookEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordWebhookEmbedField[];
  timestamp?: string;
}

// Discord webhook message contract；transport 層會再轉成 Discord API payload。
export interface DiscordWebhookMessage {
  content?: string;
  username?: string;
  embeds?: DiscordWebhookEmbed[];
}

// webhook 傳送設定；webhookUrl 可為空，讓 admin notification 可用 opt-in 方式啟用。
export interface DiscordWebhookSendOptions {
  webhookUrl: string | null | undefined;
  message: DiscordWebhookMessage;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

// webhook 傳送結果會保留 rate limit 與失敗分類，但不回傳原始 webhook URL 或未遮蔽 transport error。
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

// 從 env 讀取 Discord webhook URL；placeholder 或空值視為未設定，避免開發環境誤送。
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

// 僅接受 Discord 官方 webhook URL，並移除 hash，避免把錯誤或多餘片段帶進傳送流程。
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

// 傳送 Discord webhook 訊息；空 webhook 會安全略過，HTTP 429 會回傳 retry-after 資訊。
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

// 將內部 message contract 轉成 Discord webhook payload，並禁止 allowed_mentions 自動 ping。
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
    embeds,
    allowed_mentions: {
      parse: [],
    },
  };
}

// 將 embed 文字裁切到 Discord 上限，避免單則 admin webhook 因欄位過長送失敗。
function toDiscordEmbed(embed: DiscordWebhookEmbed): DiscordWebhookPayloadEmbed {
  return {
    title: embed.title ? formatDiscordWebhookText(embed.title, 256).trim() : undefined,
    description: embed.description ? formatDiscordWebhookText(embed.description).trim() : undefined,
    color: embed.color,
    fields: embed.fields?.map((field) => ({
      name: formatDiscordWebhookText(field.name, DISCORD_FIELD_NAME_MAX_LENGTH).trim(),
      value: formatDiscordWebhookText(field.value, DISCORD_FIELD_VALUE_MAX_LENGTH).trim(),
      inline: field.inline,
    })),
    timestamp: embed.timestamp,
  };
}

// 空 embed 不送出，避免 Discord 因無內容 embed 拒絕整個 payload。
function hasDiscordEmbedContent(embed: DiscordWebhookPayloadEmbed): boolean {
  return Boolean(embed.title || embed.description || (embed.fields && embed.fields.length > 0));
}

// 優先使用 retry-after header；沒有 header 時再讀 Discord rate-limit body。
async function resolveRetryAfterMs(response: Response): Promise<number> {
  const headerRetryAfterMs = parseRetryAfterHeader(response.headers);

  if (headerRetryAfterMs !== undefined) {
    return headerRetryAfterMs;
  }

  const body = await readRateLimitBody(response);
  const retryAfter = typeof body?.retry_after === "number" ? body.retry_after : null;

  return retryAfter !== null && Number.isFinite(retryAfter) ? Math.ceil(retryAfter * 1000) : 0;
}

// 將 Discord retry-after 秒數 header 轉成毫秒；無效值視為未提供。
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

// 讀取 Discord rate-limit body；解析失敗時回 null，避免錯誤處理再拋出新錯。
async function readRateLimitBody(response: Response): Promise<DiscordRateLimitBody | null> {
  try {
    const body = (await response.clone().json()) as DiscordRateLimitBody;
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}
