// apps/crawler/src/scripts/ops/image-cache-backfill/image-files.ts

import { copyFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { ImageBackfillOptions } from "./options";

const THUMBNAIL_MAX_SIZE = 512;
const WEBP_QUALITY = 74;

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

export async function writeFileFromReusableImage(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
}

export async function fetchSourceImageBytes(
  url: string,
  options: ImageBackfillOptions,
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
        "user-agent":
          "PartsRadarTW manual image cache backfill (+https://github.com/C6Yelan/PartsRadarTW)",
      },
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Unexpected image redirect: HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`Image request failed: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.startsWith("image/")) {
      throw new Error(`Unexpected image content type: ${contentType || "missing"}`);
    }

    const contentLength = parseContentLength(response.headers.get("content-length"));

    if (contentLength !== null && contentLength > options.maxSourceBytes) {
      throw new Error(`Source image is too large: ${formatBytes(contentLength)}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength > options.maxSourceBytes) {
      throw new Error(`Source image is too large: ${formatBytes(bytes.byteLength)}`);
    }

    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

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

export function randomDelayMs(minDelayMs: number, maxDelayMs: number): number {
  return minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}

export function toErrorMessage(error: unknown): string {
  return toSafeCliErrorMessage(error);
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
