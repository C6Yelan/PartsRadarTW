// apps/crawler/src/scripts/ops/discord-webhook/text.ts
// 提供 Discord webhook payload 文字裁切、控制字元清理與 transport error 敏感資訊遮蔽。

const DISCORD_EMBED_TEXT_MAX_LENGTH = 4096;
const DISCORD_WEBHOOK_URL_PATTERN =
  /https:\/\/(?:canary\.|ptb\.)?(?:discord|discordapp)\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9._-]+/gi;
const TRANSPORT_ERROR_SECRET_ENV_ASSIGNMENT_PATTERN =
  /\b([A-Z0-9_]*(?:DATABASE_URL|PASSWORD|SECRET|TOKEN|WEBHOOK_URL)[A-Z0-9_]*=)[^\s]+/g;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/gi;
const POSTGRES_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s@]+@[^\s]+/gi;

export function formatDiscordWebhookText(
  value: string,
  maxLength = DISCORD_EMBED_TEXT_MAX_LENGTH,
): string {
  return truncateDiscordText(replaceControlCharacters(value), maxLength);
}

// 清理 webhook 傳輸錯誤訊息，避免 webhook URL、DB URL 或 secret env assignment 進入維運通知。
export function sanitizeDiscordTransportErrorMessage(value: string): string {
  return formatDiscordWebhookText(value)
    .replace(DISCORD_WEBHOOK_URL_PATTERN, "https://discord.com/api/webhooks/***")
    .replace(POSTGRES_URL_PATTERN, "postgresql://***")
    .replace(URL_CREDENTIAL_PATTERN, "$1***:***@")
    .replace(TRANSPORT_ERROR_SECRET_ENV_ASSIGNMENT_PATTERN, "$1***");
}

// 保留換行與常見空白，但替換不可見控制字元，避免破壞 Discord 顯示或 payload。
function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    const isControlCharacter = (code >= 0 && code <= 31) || code === 127;

    return isControlCharacter && !isAllowedWhitespace ? " " : character;
  }).join("");
}

// 依 Discord 欄位限制裁切文字，保留省略號所需長度。
function truncateDiscordText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
