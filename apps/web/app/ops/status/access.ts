// apps/web/app/ops/status/access.ts
// 處理內部 /ops/status 頁面的啟用開關、token 讀取與安全比對。

import { timingSafeEqual } from "node:crypto";

// /ops/status access gate 需要的 env 欄位；公開 web service 預期維持停用。
export interface OpsStatusAccessEnv {
  [key: string]: string | undefined;
  OPS_STATUS_ENABLED?: string;
  OPS_STATUS_TOKEN?: string;
}

// 判斷目前 runtime 是否允許啟用 ops status page。
export function isOpsStatusEnabled(env: OpsStatusAccessEnv): boolean {
  return env.OPS_STATUS_ENABLED?.trim().toLowerCase() === "true";
}

// 讀取已設定的 access token，placeholder 或空值一律視為未設定。
export function readConfiguredOpsStatusToken(env: OpsStatusAccessEnv): string | null {
  const token = env.OPS_STATUS_TOKEN?.trim();

  if (!token || token.startsWith("replace_with_")) {
    return null;
  }

  return token;
}

// 驗證 request token 是否可讀取內部 ops status；比對時避免 early-exit timing 差異。
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

// 從 Authorization header 取出 Bearer token，供非 query token 的存取方式使用。
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}
