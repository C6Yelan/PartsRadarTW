// apps/crawler/src/scripts/shared/script-utils.ts
// 集中提供 crawler CLI 常用工具：參數解析、環境載入、路徑解析與錯誤輸出遮蔽。

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const SECRET_ENV_ASSIGNMENT_PATTERN =
  /\b([A-Z0-9_]*(?:DATABASE_URL|PASSWORD|PHPSESSID|SECRET|TOKEN)[A-Z0-9_]*=)[^\s]+/g;
const SECRET_FLAG_PATTERN = /(--(?:database-url|password|secret|token)\s+)[^\s]+/gi;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/gi;
const POSTGRES_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s@]+@[^\s]+/gi;
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

// 僅在可控邊界內載入環境；正式環境只讀 .env，避免本機覆寫注入來源與既有值。
export async function loadWorkspaceEnv(workspaceRoot: string): Promise<void> {
  await loadEnvFile(join(workspaceRoot, ".env"), false);

  if (shouldLoadLocalEnv()) {
    await loadEnvFile(join(workspaceRoot, ".env.local"), shouldOverrideLocalEnvFile());
  }
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
  return sanitizeCliLogMessage(error instanceof Error ? error.message : String(error));
}

// 遮蔽 CLI/log 常見敏感片段；完整規則後續需和 ops logger 收斂成同一來源。
function sanitizeCliLogMessage(message: string): string {
  return message
    .replace(POSTGRES_URL_PATTERN, "postgresql://***")
    .replace(URL_CREDENTIAL_PATTERN, "$1***:***@")
    .replace(SECRET_ENV_ASSIGNMENT_PATTERN, "$1***")
    .replace(SECRET_FLAG_PATTERN, "$1***")
    .replace(PHP_SESSION_QUERY_PATTERN, "$1***");
}

// 對 .env/ .env.local 進行逐行解析；缺行列格式會直接中斷，避免載入半套值到程式環境。
async function loadEnvFile(path: string, override: boolean): Promise<void> {
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid env assignment in ${path}: ${trimmed}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();

    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid env key "${key}" in ${path}.`);
    }

    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// 判斷是否載入 .env.local；production 不載入本機覆寫檔，避免部署環境被 local 設定影響。
function shouldLoadLocalEnv(): boolean {
  return process.env.NODE_ENV !== "production";
}

// 判斷 .env.local 是否覆寫既有 env；目前與載入條件一致，後續可合併為單一 helper。
function shouldOverrideLocalEnvFile(): boolean {
  return process.env.NODE_ENV !== "production";
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
