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

export async function loadWorkspaceEnv(workspaceRoot: string): Promise<void> {
  await loadEnvFile(join(workspaceRoot, ".env"), false);

  if (shouldLoadLocalEnv()) {
    await loadEnvFile(join(workspaceRoot, ".env.local"), shouldOverrideLocalEnvFile());
  }
}

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

// Resolves crawler script path arguments. Relative paths are rooted at the
// workspace; absolute paths remain absolute for Docker volume mount paths such
// as /var/lib/partsradar/snapshots. This is not a workspace containment check.
export function resolveRelativeToWorkspace(workspaceRoot: string, path: string): string {
  return resolve(workspaceRoot, path);
}

export function toSafeCliErrorMessage(error: unknown): string {
  return sanitizeCliLogMessage(error instanceof Error ? error.message : String(error));
}

function sanitizeCliLogMessage(message: string): string {
  return message
    .replace(POSTGRES_URL_PATTERN, "postgresql://***")
    .replace(URL_CREDENTIAL_PATTERN, "$1***:***@")
    .replace(SECRET_ENV_ASSIGNMENT_PATTERN, "$1***")
    .replace(SECRET_FLAG_PATTERN, "$1***")
    .replace(PHP_SESSION_QUERY_PATTERN, "$1***");
}

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

function shouldLoadLocalEnv(): boolean {
  return process.env.NODE_ENV !== "production";
}

function shouldOverrideLocalEnvFile(): boolean {
  return process.env.NODE_ENV !== "production";
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
