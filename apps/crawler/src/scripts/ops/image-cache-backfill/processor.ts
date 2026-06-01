import { copyFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import sharp from "sharp";
import { normalizeCoolpcProductImageUrl } from "../../../coolpc/parser";
import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { BackfillSummary, ImageBackfillOptions } from "./options";

const THUMBNAIL_MAX_SIZE = 512;
const WEBP_QUALITY = 74;

interface ProductImageCandidate {
  id: string;
  name: string;
  primaryImageUrl: string | null;
  sourceCategory: {
    igrp: number;
    displayName: string;
  };
}

type ProcessStatus = "cached" | "dry-run" | "failed" | "invalid" | "reused" | "skipped";

interface ProcessResult {
  status: ProcessStatus;
  didFetch: boolean;
}

export async function readCandidates(
  client: PrismaClient,
  options: ImageBackfillOptions,
): Promise<ProductImageCandidate[]> {
  return client.product.findMany({
    where: {
      ...(options.productId ? { id: options.productId } : {}),
      primaryImageUrl: { not: null },
      sourceCategory: {
        ...(options.igrp === null ? {} : { igrp: options.igrp }),
        enabled: true,
      },
    },
    select: {
      id: true,
      name: true,
      primaryImageUrl: true,
      sourceCategory: {
        select: {
          igrp: true,
          displayName: true,
        },
      },
    },
    orderBy: [{ sourceCategory: { igrp: "asc" } }, { id: "asc" }],
    take: options.limit ?? undefined,
  });
}

export async function backfillImages(
  candidates: ProductImageCandidate[],
  options: ImageBackfillOptions,
): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    selected: candidates.length,
    cached: 0,
    dryRun: 0,
    skipped: 0,
    reused: 0,
    invalid: 0,
    failed: 0,
    liveFetches: 0,
  };

  console.log(`Selected ${candidates.length} product image candidate(s).`);
  console.log(`Output directory: ${relative(options.workspaceRoot, options.storageDir)}`);
  console.log(
    options.dryRun
      ? "Mode: dry run; no source requests will be sent."
      : `Mode: live fetch; delay between source requests is ${options.minDelayMs}-${options.maxDelayMs}ms.`,
  );
  console.log("Duplicate source image URLs are downloaded once and reused locally.");
  console.log("");

  const reusableImagePathsBySourceUrl = new Map<string, string>();

  for (const candidate of candidates) {
    const result = await processCandidate(
      candidate,
      options,
      summary.liveFetches,
      reusableImagePathsBySourceUrl,
    );
    summary[result.status === "dry-run" ? "dryRun" : result.status] += 1;

    if (result.didFetch) {
      summary.liveFetches += 1;
    }
  }

  return summary;
}

async function processCandidate(
  candidate: ProductImageCandidate,
  options: ImageBackfillOptions,
  liveFetches: number,
  reusableImagePathsBySourceUrl: Map<string, string>,
): Promise<ProcessResult> {
  const outputPath = join(options.storageDir, `${candidate.id}.webp`);
  const label = `${candidate.sourceCategory.displayName} IGrp=${candidate.sourceCategory.igrp}`;

  try {
    const sourceImageUrl = candidate.primaryImageUrl;

    if (!sourceImageUrl) {
      console.log(`[invalid] ${candidate.id} | missing image URL | ${candidate.name}`);
      return { status: "invalid", didFetch: false };
    }

    const normalizedImageUrl = normalizeCoolpcProductImageUrl(
      sourceImageUrl,
      candidate.sourceCategory.igrp,
    );

    if (!normalizedImageUrl) {
      console.log(`[invalid] ${candidate.id} | invalid source image URL | ${sourceImageUrl}`);
      return { status: "invalid", didFetch: false };
    }

    if (!options.overwrite && (await pathExists(outputPath))) {
      if (!reusableImagePathsBySourceUrl.has(normalizedImageUrl)) {
        reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);
      }

      console.log(
        `[skipped] ${candidate.id} | existing ${relative(options.workspaceRoot, outputPath)} | ${candidate.name}`,
      );
      return { status: "skipped", didFetch: false };
    }

    const reusableImagePath = reusableImagePathsBySourceUrl.get(normalizedImageUrl);

    if (options.dryRun) {
      if (!reusableImagePath) {
        reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);
      }

      console.log(
        `[dry-run] ${candidate.id} | ${label} | ${
          reusableImagePath ? "reuse local thumbnail" : normalizedImageUrl
        } -> ${relative(options.workspaceRoot, outputPath)}`,
      );
      return { status: "dry-run", didFetch: false };
    }

    if (reusableImagePath) {
      await writeFileFromReusableImage(reusableImagePath, outputPath);
      reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);

      console.log(
        `[reused] ${candidate.id} | ${relative(options.workspaceRoot, reusableImagePath)} -> ${relative(
          options.workspaceRoot,
          outputPath,
        )} | ${candidate.name}`,
      );

      return { status: "reused", didFetch: false };
    }

    if (liveFetches > 0) {
      const waitMs = randomDelayMs(options.minDelayMs, options.maxDelayMs);
      console.log(`Waiting ${waitMs}ms before the next source image request...`);
      await delay(waitMs);
    }

    const sourceBytes = await fetchSourceImageBytes(normalizedImageUrl, options);
    const thumbnailBytes = await createWebpThumbnail(sourceBytes);
    await writeFileAtomically(outputPath, thumbnailBytes);
    reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);

    console.log(
      `[cached] ${candidate.id} | ${label} | ${formatBytes(sourceBytes.byteLength)} -> ${formatBytes(
        thumbnailBytes.byteLength,
      )} | ${candidate.name}`,
    );

    return { status: "cached", didFetch: true };
  } catch (error) {
    console.log(`[failed] ${candidate.id} | ${toErrorMessage(error)} | ${candidate.name}`);
    return { status: "failed", didFetch: true };
  }
}

async function writeFileFromReusableImage(sourcePath: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
}

async function fetchSourceImageBytes(url: string, options: ImageBackfillOptions): Promise<Buffer> {
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

async function createWebpThumbnail(sourceBytes: Buffer): Promise<Buffer> {
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

async function writeFileAtomically(path: string, bytes: Buffer): Promise<void> {
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

function parseContentLength(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}

async function pathExists(path: string): Promise<boolean> {
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

function randomDelayMs(minDelayMs: number, maxDelayMs: number): number {
  return minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function toErrorMessage(error: unknown): string {
  return toSafeCliErrorMessage(error);
}
