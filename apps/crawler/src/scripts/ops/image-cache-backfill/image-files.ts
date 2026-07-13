// apps/crawler/src/scripts/ops/image-cache-backfill/image-files.ts
// 提供圖片補圖流程的檔案存在檢查、來源圖片抓取、WebP 轉檔與安全寫入工具。

import { copyFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import { tryAcquireExternalFetchLock } from "../external-fetch-lock";
import type { ImageBackfillOptions } from "./options";

const THUMBNAIL_MAX_SIZE = 512;
const WEBP_QUALITY = 74;

export type SourceImageFailureKind =
  | "content_type"
  | "decode"
  | "http"
  | "lock_busy"
  | "network"
  | "too_large"
  | "timeout";

export class SourceImageFetchError extends Error {
  constructor(
    message: string,
    readonly kind: SourceImageFailureKind,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "SourceImageFetchError";
  }
}

// 檢查本地圖片檔是否存在；只有 ENOENT 視為不存在，其餘檔案系統錯誤向外拋出。
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

// 將相同來源圖片已產生的本地 WebP 複製給另一個商品，避免重複對來源站發 request。
export async function writeFileFromReusableImage(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
}

// 抓取來源商品圖片 bytes，限制 redirect、content type、timeout 與最大來源大小。
export async function fetchSourceImageBytes(
  url: string,
  options: ImageBackfillOptions,
  onRequestStarted: () => void = () => {},
): Promise<Buffer> {
  const sourceImageFetchLock = await tryAcquireExternalFetchLock({
    lockDir: options.sourceImageFetchLockDir,
    owner: "image-backfill",
    staleSeconds: options.sourceImageFetchLockStaleSeconds,
  });

  if (!sourceImageFetchLock) {
    throw new SourceImageFetchError(
      "Source image request deferred because another live source fetch holds the lock.",
      "lock_busy",
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    onRequestStarted();
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
          "user-agent":
            "PartsRadarTW image cache recovery (+https://github.com/C6Yelan/PartsRadarTW)",
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new SourceImageFetchError(
          `Source image request timed out after ${options.timeoutMs}ms`,
          "timeout",
        );
      }

      throw new SourceImageFetchError(
        error instanceof Error ? error.message : "Source image request failed",
        "network",
      );
    }

    if (response.status >= 300 && response.status < 400) {
      throw new SourceImageFetchError(
        `Unexpected image redirect: HTTP ${response.status}`,
        "http",
        response.status,
      );
    }

    if (!response.ok) {
      throw new SourceImageFetchError(
        `Image request failed: HTTP ${response.status}`,
        "http",
        response.status,
      );
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.startsWith("image/")) {
      throw new SourceImageFetchError(
        `Unexpected image content type: ${contentType || "missing"}`,
        "content_type",
        response.status,
      );
    }

    const contentLength = parseContentLength(response.headers.get("content-length"));

    if (contentLength !== null && contentLength > options.maxSourceBytes) {
      throw new SourceImageFetchError(
        `Source image is too large: ${formatBytes(contentLength)}`,
        "too_large",
        response.status,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength > options.maxSourceBytes) {
      throw new SourceImageFetchError(
        `Source image is too large: ${formatBytes(bytes.byteLength)}`,
        "too_large",
        response.status,
      );
    }

    return bytes;
  } finally {
    clearTimeout(timeoutId);
    await sourceImageFetchLock.release();
  }
}

// 將來源圖片正規化為最長邊 512px 的 WebP thumbnail，並保留圖片方向資訊。
export async function createWebpThumbnail(sourceBytes: Buffer): Promise<Buffer> {
  return sharp(sourceBytes, { failOn: "error" })
    .rotate()
    .resize({
      width: THUMBNAIL_MAX_SIZE,
      height: THUMBNAIL_MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

// 先寫入暫存檔再 rename 成目標檔，避免中斷時留下半寫入的快取圖片。
export async function writeFileAtomically(path: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(tempPath, bytes);
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

// 產生包含上下限的隨機延遲，分散手動補圖對來源站的請求節奏。
export function randomDelayMs(minDelayMs: number, maxDelayMs: number): number {
  return minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1));
}

// 包裝 setTimeout，供補圖流程在來源站請求之間等待。
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 格式化補圖 log 使用的 byte 數，避免逐處重複單位轉換。
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function parseContentLength(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
