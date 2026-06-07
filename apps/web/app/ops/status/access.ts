// apps/web/app/ops/status/access.ts
import { timingSafeEqual } from "node:crypto";

export interface OpsStatusAccessEnv {
  [key: string]: string | undefined;
  OPS_STATUS_ENABLED?: string;
  OPS_STATUS_TOKEN?: string;
}

export function isOpsStatusEnabled(env: OpsStatusAccessEnv): boolean {
  return env.OPS_STATUS_ENABLED?.trim().toLowerCase() === "true";
}

export function readConfiguredOpsStatusToken(env: OpsStatusAccessEnv): string | null {
  const token = env.OPS_STATUS_TOKEN?.trim();

  if (!token || token.startsWith("replace_with_")) {
    return null;
  }

  return token;
}

export function isOpsStatusAccessAllowed(
  env: OpsStatusAccessEnv,
  providedToken: string | null | undefined,
): boolean {
  if (!isOpsStatusEnabled(env)) {
    return false;
  }

  const configuredToken = readConfiguredOpsStatusToken(env);
  const requestToken = providedToken?.trim();

  if (!configuredToken || !requestToken) {
    return false;
  }

  const configuredBuffer = Buffer.from(configuredToken);
  const requestBuffer = Buffer.from(requestToken);

  return (
    configuredBuffer.length === requestBuffer.length &&
    timingSafeEqual(configuredBuffer, requestBuffer)
  );
}

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}
