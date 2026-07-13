// 保存最近一次 CoolPC 篩選同步結果；寫入採原子 rename，失敗時保留上一版可用資料。

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isProductFilterTagSupported } from "@partsradar/shared";

export const COOLPC_FILTER_SYNC_STATE_VERSION = 2;
const MAX_FILTER_SYNC_STATE_BYTES = 10 * 1024 * 1024;

export interface CoolpcFilterSyncState {
  version: typeof COOLPC_FILTER_SYNC_STATE_VERSION;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  sourceHash: string | null;
  conditionCount: number;
  productCount: number;
  taggedProductCount: number;
  ambiguousProductCount: number;
  tagsByIgrp: Record<string, Record<string, string[]>>;
}

export async function readCoolpcFilterSyncState(
  path: string,
): Promise<CoolpcFilterSyncState | null> {
  let contents: string;

  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  if (Buffer.byteLength(contents) > MAX_FILTER_SYNC_STATE_BYTES) {
    throw new Error("CoolPC filter sync state exceeds the size limit.");
  }

  return validateState(JSON.parse(contents) as unknown);
}

export async function writeCoolpcFilterSyncState(
  path: string,
  state: CoolpcFilterSyncState,
): Promise<void> {
  validateState(state);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

function validateState(value: unknown): CoolpcFilterSyncState {
  if (!isRecord(value) || value.version !== COOLPC_FILTER_SYNC_STATE_VERSION) {
    throw new Error("Invalid CoolPC filter sync state file.");
  }

  if (
    !isIsoDate(value.lastAttemptAt) ||
    !isNullableIsoDate(value.lastSuccessAt) ||
    !isNullableString(value.lastError) ||
    !isNullableString(value.sourceHash) ||
    !isNonNegativeInteger(value.conditionCount) ||
    !isNonNegativeInteger(value.productCount) ||
    !isNonNegativeInteger(value.taggedProductCount) ||
    !isNonNegativeInteger(value.ambiguousProductCount) ||
    !isRecord(value.tagsByIgrp)
  ) {
    throw new Error("Invalid CoolPC filter sync state file.");
  }

  for (const [igrpValue, products] of Object.entries(value.tagsByIgrp)) {
    const igrp = Number(igrpValue);
    if (!Number.isInteger(igrp) || !isRecord(products)) {
      throw new Error("Invalid CoolPC filter sync state file.");
    }

    for (const [productName, tags] of Object.entries(products)) {
      if (!productName || !Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
        throw new Error("Invalid CoolPC filter sync state file.");
      }
      if (tags.some((tag) => !isProductFilterTagSupported(igrp, tag))) {
        throw new Error("CoolPC filter sync state contains unsupported tags.");
      }
    }
  }

  return value as unknown as CoolpcFilterSyncState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
