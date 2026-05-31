// This script is a manual image-cache backfill tool for local validation.
// It downloads source product images at a low, jittered rate and writes small WebP thumbnails.
// Do not use this as the production scheduled crawler entrypoint.
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import sharp from "sharp";
import { normalizeCoolpcProductImageUrl } from "../coolpc/parser";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_STORAGE_DIR = "storage/product-images";
const DEFAULT_MIN_DELAY_MS = 5000;
const DEFAULT_MAX_DELAY_MS = 12000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const THUMBNAIL_MAX_SIZE = 512;
const WEBP_QUALITY = 74;

interface ImageBackfillOptions {
  workspaceRoot: string;
  storageDir: string;
  limit: number | null;
  productId: string | null;
  igrp: number | null;
  minDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  maxSourceBytes: number;
  dryRun: boolean;
  overwrite: boolean;
}

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

interface BackfillSummary {
  selected: number;
  cached: number;
  dryRun: number;
  skipped: number;
  reused: number;
  invalid: number;
  failed: number;
  liveFetches: number;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;

    const candidates = await readCandidates(client, options);
    const summary = await backfillImages(candidates, options);

    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

async function readCandidates(
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

async function backfillImages(
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

function parseOptions(args: string[]): ImageBackfillOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const workspaceRoot = resolve(process.cwd(), "..", "..");
  const dryRun = args.includes("--dry-run");

  if (!dryRun && !args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing live CoolPC image fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this command contacts the source site and must stay manual-only.`,
    );
  }

  const minDelayMs = getNumberArg(args, "--min-delay-ms", DEFAULT_MIN_DELAY_MS);
  const maxDelayMs = getNumberArg(args, "--max-delay-ms", DEFAULT_MAX_DELAY_MS);

  if (minDelayMs > maxDelayMs) {
    throw new Error("--min-delay-ms must be less than or equal to --max-delay-ms.");
  }

  return {
    workspaceRoot,
    storageDir: resolveRelativeToWorkspace(
      workspaceRoot,
      getStringArg(args, "--storage-dir") ??
        process.env.PRODUCT_IMAGE_STORAGE_DIR ??
        DEFAULT_STORAGE_DIR,
    ),
    limit: getOptionalPositiveNumberArg(args, "--limit"),
    productId: getStringArg(args, "--product-id") ?? null,
    igrp: getOptionalPositiveNumberArg(args, "--igrp"),
    minDelayMs,
    maxDelayMs,
    timeoutMs: getNumberArg(args, "--timeout-ms", DEFAULT_TIMEOUT_MS),
    maxSourceBytes: getNumberArg(args, "--max-source-bytes", DEFAULT_MAX_SOURCE_BYTES),
    dryRun,
    overwrite: args.includes("--overwrite"),
  };
}

async function loadWorkspaceEnv(workspaceRoot: string): Promise<void> {
  await loadEnvFile(join(workspaceRoot, ".env"), false);
  await loadEnvFile(join(workspaceRoot, ".env.local"), true);
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
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
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

function getStringArg(args: string[], name: string): string | undefined {
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

function getOptionalPositiveNumberArg(args: string[], name: string): number | null {
  const raw = getStringArg(args, name);

  if (!raw) {
    return null;
  }

  const value = parseInteger(raw, name);

  if (value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function getNumberArg(args: string[], name: string, fallback: number): number {
  const raw = getStringArg(args, name);

  if (!raw) {
    return fallback;
  }

  const value = parseInteger(raw, name);

  if (value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

function parseInteger(raw: string, name: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer.`);
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} is too large.`);
  }

  return value;
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

function resolveRelativeToWorkspace(workspaceRoot: string, path: string): string {
  return resolve(workspaceRoot, path);
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
  return error instanceof Error ? error.message : String(error);
}

function printSummary(summary: BackfillSummary, options: ImageBackfillOptions): void {
  console.log("");
  console.log("Product image cache backfill finished.");
  console.log(`- Selected: ${summary.selected}`);
  console.log(`- Cached: ${summary.cached}`);
  console.log(`- Dry run: ${summary.dryRun}`);
  console.log(`- Skipped existing: ${summary.skipped}`);
  console.log(`- Reused local thumbnail: ${summary.reused}`);
  console.log(`- Invalid source URL: ${summary.invalid}`);
  console.log(`- Failed: ${summary.failed}`);
  console.log(`- Live source requests: ${summary.liveFetches}`);
  console.log(`- Output directory: ${relative(options.workspaceRoot, options.storageDir)}`);
}

function printHelp(): void {
  console.log(`Usage:
  pnpm image-cache:backfill -- --dry-run --limit 10
  pnpm image-cache:backfill -- --confirm-live-fetch --limit 10

Options:
  --confirm-live-fetch       Required for live CoolPC image requests.
  --dry-run                  Validate candidates and output paths without source requests.
  --limit <count>            Limit selected products.
  --product-id <uuid>        Backfill a single product.
  --igrp <number>            Backfill one enabled CoolPC category.
  --overwrite                Regenerate existing cached thumbnails.
  --min-delay-ms <ms>        Minimum randomized delay between source image requests.
                             Default: ${DEFAULT_MIN_DELAY_MS}
  --max-delay-ms <ms>        Maximum randomized delay between source image requests.
                             Default: ${DEFAULT_MAX_DELAY_MS}
  --timeout-ms <ms>          Source image request timeout.
                             Default: ${DEFAULT_TIMEOUT_MS}
  --max-source-bytes <bytes> Maximum accepted source image size.
                             Default: ${DEFAULT_MAX_SOURCE_BYTES}
  --storage-dir <path>       Output directory from the workspace root, or an absolute path.
                             Default: PRODUCT_IMAGE_STORAGE_DIR, then ${DEFAULT_STORAGE_DIR}
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
