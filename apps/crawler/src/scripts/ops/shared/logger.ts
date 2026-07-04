// apps/crawler/src/scripts/ops/shared/logger.ts
export type OpsLogLevel = "debug" | "info" | "warn" | "error";

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

export function createOpsLogger({
  level = parseOpsLogLevel(process.env.LOG_LEVEL),
  now = () => new Date(),
  sink = console.log,
}: {
  level?: OpsLogLevel;
  now?: () => Date;
  sink?: (line: string) => void;
} = {}): OpsLogger {
  function write(nextLevel: OpsLogLevel, message: string, fields: Record<string, unknown> = {}) {
    if (LEVEL_ORDER[nextLevel] < LEVEL_ORDER[level]) {
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
    `message=${formatOpsLogValue(redactSensitiveText(message))}`,
    ...fieldEntries,
  ].join(" ");
}

function parseOpsLogLevel(value: string | undefined): OpsLogLevel {
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}

function formatOpsLogValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const text = redactSensitiveText(String(value));

  return /^[A-Za-z0-9._:/-]+$/.test(text) ? text : JSON.stringify(text);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/(token=)[^\s]+/gi, "$1[redacted]")
    .replace(/(password=)[^\s]+/gi, "$1[redacted]")
    .replace(/(secret=)[^\s]+/gi, "$1[redacted]")
    .replace(/(webhookUrl=)[^\s]+/gi, "$1[redacted]");
}
