// apps/crawler/src/scripts/ops/discord-webhook/text.ts

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

export function sanitizeDiscordTransportErrorMessage(value: string): string {
  return formatDiscordWebhookText(value)
    .replace(DISCORD_WEBHOOK_URL_PATTERN, "https://discord.com/api/webhooks/***")
    .replace(POSTGRES_URL_PATTERN, "postgresql://***")
    .replace(URL_CREDENTIAL_PATTERN, "$1***:***@")
    .replace(TRANSPORT_ERROR_SECRET_ENV_ASSIGNMENT_PATTERN, "$1***");
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    const isControlCharacter = (code >= 0 && code <= 31) || code === 127;

    return isControlCharacter && !isAllowedWhitespace ? " " : character;
  }).join("");
}

function truncateDiscordText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
