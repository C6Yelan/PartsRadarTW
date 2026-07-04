// apps/crawler/src/scripts/ops/discord-bot/rest-failure.ts

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { DiscordRestResult } from "./types";

export function formatDiscordRestFailure(
  result: Exclude<DiscordRestResult<unknown>, { status: "ok" }>,
): string {
  if (result.status === "rate_limited") {
    return `rate_limited retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`;
  }

  return `failed httpStatus=${result.httpStatus ?? "none"} message=${toSafeCliErrorMessage(
    result.message,
  )}`;
}
