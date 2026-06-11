// apps/crawler/src/scripts/ops/discord-bot/cooldowns.ts

import type { CommandCooldownResult } from "./types";

export class CommandCooldowns {
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
