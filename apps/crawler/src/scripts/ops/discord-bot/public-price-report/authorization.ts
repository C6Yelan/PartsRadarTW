// apps/crawler/src/scripts/ops/discord-bot/public-price-report/authorization.ts
// 驗證 public-report interaction 當次攜帶的 guild member permission bitfield。

import { DISCORD_PERMISSION_ADMINISTRATOR, DISCORD_PERMISSION_MANAGE_GUILD } from "../constants";
import type { DiscordInteraction } from "../types";

const MAX_DISCORD_PERMISSION_BITSET = (1n << 64n) - 1n;
const MAX_DISCORD_PERMISSION_DIGITS = MAX_DISCORD_PERMISSION_BITSET.toString().length;

// 僅接受 Discord 使用的 unsigned 64-bit 十進位 permission bitfield。
export function parseDiscordPermissionBitset(value: string | undefined): bigint | null {
  const normalized = value?.trim();

  if (
    !normalized ||
    normalized.length > MAX_DISCORD_PERMISSION_DIGITS ||
    !/^(0|[1-9][0-9]*)$/.test(normalized)
  ) {
    return null;
  }

  try {
    const bitset = BigInt(normalized);

    return bitset <= MAX_DISCORD_PERMISSION_BITSET ? bitset : null;
  } catch {
    return null;
  }
}

// 檢查 permission bitfield 是否完整包含指定權限。
export function hasDiscordPermission(value: string | undefined, permission: bigint): boolean {
  const bitset = parseDiscordPermissionBitset(value);

  return bitset !== null && (bitset & permission) === permission;
}

// public-report 管理操作必須由當次 guild interaction 的管理員重新授權。
export function canManagePublicReport(interaction: DiscordInteraction): boolean {
  if (!interaction.guild_id?.trim() || !interaction.member) {
    return false;
  }

  const permissions = interaction.member.permissions;

  return (
    hasDiscordPermission(permissions, DISCORD_PERMISSION_MANAGE_GUILD) ||
    hasDiscordPermission(permissions, DISCORD_PERMISSION_ADMINISTRATOR)
  );
}
