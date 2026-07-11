// apps/crawler/src/scripts/ops/shared/logger.ts
// 提供 ops daemon / CLI 共用的 key-value logger，統一 log level、時間戳與敏感字串遮蔽。
import { sanitizeSensitiveText } from "../../shared/script-utils";

export type OpsLogLevel = "debug" | "info" | "warn" | "error";

// ops 腳本共用的最小 logger 介面，避免各 daemon 分散處理輸出格式與遮蔽。
export interface OpsLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<OpsLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// 建立具 level filter 的 ops logger；預設輸出到 console.log。
export function createOpsLogger({
  level,
  now = () => new Date(),
  sink = console.log,
}: {
  level?: OpsLogLevel;
  now?: () => Date;
  sink?: (line: string) => void;
} = {}): OpsLogger {
  let resolvedLevel = level;

  function write(nextLevel: OpsLogLevel, message: string, fields: Record<string, unknown> = {}) {
    // Entrypoints load the workspace .env after module imports, so resolve the
    // implicit level on first use instead of capturing process.env at import time.
    resolvedLevel ??= parseOpsLogLevel(process.env.LOG_LEVEL);

    if (LEVEL_ORDER[nextLevel] < LEVEL_ORDER[resolvedLevel]) {
      return;
    }

    sink(formatOpsLogLine(now(), nextLevel, message, fields));
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}

// 將單筆 log 格式化成 timestamp + key-value，供 daemon log 與測試穩定比對。
export function formatOpsLogLine(
  timestamp: Date,
  level: OpsLogLevel,
  message: string,
  fields: Record<string, unknown> = {},
): string {
  const fieldEntries = Object.entries(fields).map(
    ([key, value]) => `${key}=${formatOpsLogValue(value)}`,
  );

  return [
    timestamp.toISOString(),
    `level=${level}`,
    `message=${formatOpsLogValue(message)}`,
    ...fieldEntries,
  ].join(" ");
}

// 解析 LOG_LEVEL；未設定或未知值時回到 info，避免拼錯造成 log 全開或全關。
function parseOpsLogLevel(value: string | undefined): OpsLogLevel {
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}

// 將 log field 轉成 shell-friendly value，必要時用 JSON string 保留空白與特殊字元。
function formatOpsLogValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const text = sanitizeSensitiveText(String(value));

  return /^[A-Za-z0-9._:/-]+$/.test(text) ? text : JSON.stringify(text);
}
