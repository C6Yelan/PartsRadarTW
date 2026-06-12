// apps/crawler/src/scripts/ops/external-fetch-lock.ts
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS = 12 * 60 * 60;
export const DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS = 10 * 60;

interface ExternalFetchLockMetadata {
  owner: string;
  token: string;
  pid: number;
  acquiredAt: string;
}

interface ExternalFetchPriorityMetadata {
  owner: string;
  pid: number;
  requestedAt: string;
}

export interface ExternalFetchLockHandle {
  readonly lockDir: string;
  readonly owner: string;
  release(): Promise<void>;
}

interface AcquireExternalFetchLockOptions {
  lockDir: string;
  owner: string;
  staleSeconds?: number;
  now?: () => Date;
}

interface ExternalFetchPrioritySignalOptions {
  lockDir: string;
  owner: string;
  ttlSeconds?: number;
  now?: () => Date;
}

interface HasActiveExternalFetchPriorityOptions {
  lockDir: string;
  owner?: string;
  ttlSeconds?: number;
  now?: () => Date;
}

const LOCK_METADATA_FILE = "lock.json";

export async function tryAcquireExternalFetchLock({
  lockDir,
  owner,
  staleSeconds = DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  now = () => new Date(),
}: AcquireExternalFetchLockOptions): Promise<ExternalFetchLockHandle | null> {
  const token = randomUUID();
  const acquiredAt = now();

  await mkdir(dirname(lockDir), { recursive: true });

  try {
    await mkdir(lockDir);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "EEXIST") {
      throw error;
    }

    const existingMetadata = await readLockMetadata(lockDir);

    if (!isStaleLock(existingMetadata?.acquiredAt ?? null, staleSeconds, acquiredAt)) {
      return null;
    }

    await rm(lockDir, { recursive: true, force: true });

    try {
      await mkdir(lockDir);
    } catch (retryError) {
      if (isNodeError(retryError) && retryError.code === "EEXIST") {
        return null;
      }

      throw retryError;
    }
  }

  const metadata: ExternalFetchLockMetadata = {
    owner,
    token,
    pid: process.pid,
    acquiredAt: acquiredAt.toISOString(),
  };

  await writeFile(getMetadataPath(lockDir), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    lockDir,
    owner,
    async release() {
      const currentMetadata = await readLockMetadata(lockDir);

      if (currentMetadata?.token !== token) {
        return;
      }

      await rm(lockDir, { recursive: true, force: true });
    },
  };
}

export async function requestExternalFetchPriority({
  lockDir,
  owner,
  now = () => new Date(),
}: ExternalFetchPrioritySignalOptions): Promise<void> {
  await mkdir(getPriorityDir(lockDir), { recursive: true });

  const metadata: ExternalFetchPriorityMetadata = {
    owner,
    pid: process.pid,
    requestedAt: now().toISOString(),
  };

  await writeFile(
    getPrioritySignalPath(lockDir, owner),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
}

export async function clearExternalFetchPriority({
  lockDir,
  owner,
}: Pick<ExternalFetchPrioritySignalOptions, "lockDir" | "owner">): Promise<void> {
  await rm(getPrioritySignalPath(lockDir, owner), { force: true });
}

export async function hasActiveExternalFetchPriority({
  lockDir,
  owner,
  ttlSeconds = DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
  now = () => new Date(),
}: HasActiveExternalFetchPriorityOptions): Promise<boolean> {
  const priorityDir = getPriorityDir(lockDir);
  let entries: string[];

  try {
    entries = await readdir(priorityDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const metadata = await readPriorityMetadata(`${priorityDir}/${entry}`);

    if (!metadata) {
      continue;
    }

    if (isStaleLock(metadata.requestedAt, ttlSeconds, now())) {
      await rm(`${priorityDir}/${entry}`, { force: true });
      continue;
    }

    if (!owner || metadata.owner === owner) {
      return true;
    }
  }

  return false;
}

async function readLockMetadata(lockDir: string): Promise<ExternalFetchLockMetadata | null> {
  try {
    const raw = await readFile(getMetadataPath(lockDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<ExternalFetchLockMetadata>;

    if (
      typeof parsed.owner === "string" &&
      typeof parsed.token === "string" &&
      typeof parsed.pid === "number" &&
      typeof parsed.acquiredAt === "string"
    ) {
      return parsed as ExternalFetchLockMetadata;
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }

  return null;
}

async function readPriorityMetadata(path: string): Promise<ExternalFetchPriorityMetadata | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<ExternalFetchPriorityMetadata>;

    if (
      typeof parsed.owner === "string" &&
      typeof parsed.pid === "number" &&
      typeof parsed.requestedAt === "string"
    ) {
      return parsed as ExternalFetchPriorityMetadata;
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }

  return null;
}

function isStaleLock(acquiredAt: string | null, staleSeconds: number, now: Date): boolean {
  if (!acquiredAt) {
    return true;
  }

  const acquiredTime = Date.parse(acquiredAt);

  if (!Number.isFinite(acquiredTime)) {
    return true;
  }

  return now.getTime() - acquiredTime >= staleSeconds * 1000;
}

function getMetadataPath(lockDir: string): string {
  return `${lockDir}/${LOCK_METADATA_FILE}`;
}

function getPriorityDir(lockDir: string): string {
  return `${lockDir}.priority`;
}

function getPrioritySignalPath(lockDir: string, owner: string): string {
  return `${getPriorityDir(lockDir)}/${sanitizeOwner(owner)}.json`;
}

function sanitizeOwner(owner: string): string {
  return owner.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
