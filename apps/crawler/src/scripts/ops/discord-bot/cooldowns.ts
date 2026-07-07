// apps/crawler/src/scripts/ops/discord-bot/cooldowns.ts
// 提供 Discord bot 指令的行程內使用者冷卻控制，避免即時互動短時間重複觸發。

import type { CommandCooldownResult } from "./types";

// 以 Discord user id 記錄最近一次成功使用時間；重啟後會清空，僅作為互動節流。
export class CommandCooldowns {
  private readonly lastUsedAtByUser = new Map<string, number>();

  constructor(private readonly cooldownSeconds: number) {}

  // 嘗試消耗使用者冷卻額度；未過冷卻時回傳剩餘秒數供 interaction 回覆。
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
