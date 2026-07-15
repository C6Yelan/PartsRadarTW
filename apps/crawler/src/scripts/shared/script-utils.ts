// apps/crawler/src/scripts/shared/script-utils.ts
// 集中提供 crawler CLI 常用工具：參數解析、環境載入、路徑解析與錯誤輸出遮蔽。

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const SECRET_ENV_ASSIGNMENT_PATTERN =
  /\b((?:DATABASE_URL|PHPSESSID|(?:[A-Z0-9_]+_)?(?:TOKEN|PASSWORD|SECRET)|(?:[A-Z0-9_]+_)?WEBHOOK_?URL)\s*=\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+)/gi;
const AUTHORIZATION_CREDENTIAL_PATTERN =
  /(\bAuthorization\s*[:=]\s*(?:Bearer|Bot)\s+)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi;
const SECRET_FLAG_PATTERN =
  /(--(?:database-url|password|secret|token)\s+)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+)/gi;
const SECRET_COLON_PATTERN =
  /(\b(?:token|password|secret)\s*:\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/gi;
const POSTGRES_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s'"<>]+/gi;
const DISCORD_WEBHOOK_URL_PATTERN =
  /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/[^\s'"<>]+/gi;
const PHP_SESSION_QUERY_PATTERN = /([?&]PHPSESSID=)[^&\s]+/gi;
const WORKSPACE_ROOT_MARKER = "pnpm-workspace.yaml";

// 由目前目錄往上尋找 pnpm workspace root；找不到就視為執行環境不正確。
export function resolveWorkspaceRoot(cwd = process.cwd()): string {
  let currentDir = resolve(cwd);

  while (true) {
    if (existsSync(join(currentDir, WORKSPACE_ROOT_MARKER))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(
        `Unable to resolve workspace root from ${cwd}. Expected to find ${WORKSPACE_ROOT_MARKER}.`,
      );
    }

    currentDir = parentDir;
  }
}

// 僅讀取 workspace .env，且不覆寫既有 process env。
export async function loadWorkspaceEnv(workspaceRoot: string): Promise<void> {
  await loadEnvFile(join(workspaceRoot, ".env"), ".env");
}

// 讀取指定 CLI flag 後方的字串值；缺值或下一個 token 是 flag 時直接報錯。
export function getStringArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

// 解析 CLI/env 的有界整數選項，統一覆寫優先序、格式與安全範圍檢查。
export function parseBoundedIntegerOption({
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

  if (!NON_NEGATIVE_INTEGER_PATTERN.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}

// 讀取非負整數 CLI 參數；未提供時回傳 fallback。
export function getNumberArg(args: string[], name: string, fallback: number): number {
  const raw = getStringArg(args, name);

  if (!raw) {
    return fallback;
  }

  if (!NON_NEGATIVE_INTEGER_PATTERN.test(raw)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

// 讀取正整數 CLI 參數；未提供時回傳 null，供 optional limit 類參數使用。
export function getPositiveNumberArg(args: string[], name: string): number | null {
  const raw = getStringArg(args, name);

  if (!raw) {
    return null;
  }

  if (!NON_NEGATIVE_INTEGER_PATTERN.test(raw)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

// 將 CLI/env 取得的相對路徑解析到 workspace root 底下。
export function resolveWorkspacePathArgument(workspaceRoot: string, path: string): string {
  return resolve(workspaceRoot, path);
}

// 輸出 CLI 錯誤前先套用遮蔽規則，避免密鑰字串外流。
export function toSafeCliErrorMessage(error: unknown): string {
  return sanitizeSensitiveText(error instanceof Error ? error.message : String(error));
}

// 遮蔽 CLI 與 ops log 已確認會出現的敏感格式，讓所有輸出共用同一規則。
export function sanitizeSensitiveText(value: string): string {
  return value
    .replace(DISCORD_WEBHOOK_URL_PATTERN, "https://discord.com/api/webhooks/[redacted]")
    .replace(POSTGRES_URL_PATTERN, "postgresql://[redacted]")
    .replace(URL_CREDENTIAL_PATTERN, "$1[redacted]:[redacted]@")
    .replace(SECRET_ENV_ASSIGNMENT_PATTERN, "$1[redacted]")
    .replace(AUTHORIZATION_CREDENTIAL_PATTERN, "$1[redacted]")
    .replace(SECRET_FLAG_PATTERN, "$1[redacted]")
    .replace(SECRET_COLON_PATTERN, "$1[redacted]")
    .replace(PHP_SESSION_QUERY_PATTERN, "$1[redacted]");
}

// 對 .env 進行逐行解析；缺行列格式會直接中斷，且錯誤不回顯原始內容。
async function loadEnvFile(path: string, displayPath: string): Promise<void> {
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid env assignment in ${displayPath} at line ${lineIndex + 1}.`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();

    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid env key in ${displayPath} at line ${lineIndex + 1}.`);
    }

    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// 移除 env value 外層成對引號；不處理 shell escape，維持簡單 .env parser 邊界。
function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

// 收斂 Node.js syscall error 判斷，供 ENOENT 等檔案錯誤分支使用。
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
