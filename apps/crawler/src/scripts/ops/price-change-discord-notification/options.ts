// apps/crawler/src/scripts/ops/price-change-discord-notification/options.ts

import { getStringArg } from "../../shared/script-utils";
import { readDiscordWebhookUrl } from "../discord-webhook";
import {
  DEFAULT_PRICE_CHANGE_DISCORD_MAX_ITEMS,
  DEFAULT_PUBLIC_BASE_URL,
  MAX_PRICE_CHANGE_DISCORD_ITEMS,
} from "./constants";
import type { PriceChangeDiscordNotificationOptions } from "./types";

export function parsePriceChangeDiscordNotificationOptions(
  args: string[],
  env: NodeJS.ProcessEnv,
): PriceChangeDiscordNotificationOptions {
  return {
    publicWebhookUrl: readDiscordWebhookUrl(env, "DISCORD_PUBLIC_WEBHOOK_URL"),
    publicBaseUrl: normalizePublicBaseUrl(
      env.PARTSRADAR_PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL,
    ),
    maxItems: parseIntegerOption({
      args,
      env,
      argName: "--price-change-discord-max-items",
      envName: "PRICE_CHANGE_DISCORD_MAX_ITEMS",
      fallback: DEFAULT_PRICE_CHANGE_DISCORD_MAX_ITEMS,
      min: 1,
      max: MAX_PRICE_CHANGE_DISCORD_ITEMS,
    }),
  };
}

export function normalizePublicBaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("PARTSRADAR_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PARTSRADAR_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }

  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";

  return url.toString();
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
