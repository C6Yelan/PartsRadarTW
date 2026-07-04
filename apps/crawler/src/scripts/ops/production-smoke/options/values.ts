// apps/crawler/src/scripts/ops/production-smoke/options/values.ts

import { getStringArg } from "../../../shared/script-utils";

export function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }

    return url.toString();
  } catch {
    throw new Error("--base-url/SMOKE_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }
}

export function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallbackArgName,
  fallbackEnvName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallbackArgName?: string;
  fallbackEnvName?: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw =
    getStringArg(args, argName) ??
    (fallbackArgName ? getStringArg(args, fallbackArgName) : undefined) ??
    env[envName] ??
    (fallbackEnvName ? env[fallbackEnvName] : undefined) ??
    String(fallback);
  const aliases = [argName, envName, fallbackArgName, fallbackEnvName].filter(Boolean).join("/");
  const message = `${aliases} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}
