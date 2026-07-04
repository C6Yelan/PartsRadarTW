// Focused owner for Discord bot CLI error formatting.
import { toSafeCliErrorMessage } from "../../shared/script-utils";

export function formatDiscordBotCliError(error: unknown): string {
  return toSafeCliErrorMessage(error);
}
