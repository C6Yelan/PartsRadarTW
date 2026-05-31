import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import {
  processCoolpcCategorySnapshotWithPrisma,
  type CoolpcCategorySnapshotInput,
} from "./category-snapshot";
import {
  CRAWL_TRIGGER_TYPES,
  runCoolpcCrawlOnceWithPrisma,
  type CrawlTriggerTypeValue,
  type RunCoolpcCrawlOnceResult,
} from "./crawl-run";
import { createCoolpcCategoryUrl, decodeCoolpcHtml } from "./parser";

export const DEFAULT_COOLPC_CATEGORY_DELAY_MS = 5000;
export const DEFAULT_COOLPC_FETCH_TIMEOUT_MS = 30000;

export interface RunCoolpcCategoryCrawlOptions {
  client: PrismaClient;
  storageDir: string;
  triggerType?: CrawlTriggerTypeValue;
  fromRawDir?: string | null;
  delayMs?: number;
  fetchTimeoutMs?: number;
  baseUrl?: string;
  fetchUserAgent: string;
  log?: (message: string) => void;
}

export async function runCoolpcCategoryCrawl({
  client,
  storageDir,
  triggerType = CRAWL_TRIGGER_TYPES.MANUAL,
  fromRawDir = null,
  delayMs = DEFAULT_COOLPC_CATEGORY_DELAY_MS,
  fetchTimeoutMs = DEFAULT_COOLPC_FETCH_TIMEOUT_MS,
  baseUrl,
  fetchUserAgent,
  log,
}: RunCoolpcCategoryCrawlOptions): Promise<RunCoolpcCrawlOnceResult> {
  let processedCategoryCount = 0;

  return runCoolpcCrawlOnceWithPrisma({
    client,
    triggerType,
    processCategory: async ({ crawlRunId, category }) => {
      if (!fromRawDir && processedCategoryCount > 0) {
        await delay(delayMs);
      }

      processedCategoryCount += 1;

      const fetchedAt = new Date();
      const url = createCoolpcCategoryUrl(category.igrp, baseUrl);
      const snapshot = fromRawDir
        ? await readRawCategorySnapshot(fromRawDir, category.igrp, fetchedAt, url, log)
        : await fetchLiveCategorySnapshot(
            category.igrp,
            fetchedAt,
            url,
            fetchUserAgent,
            fetchTimeoutMs,
            log,
          );

      return processCoolpcCategorySnapshotWithPrisma({
        client,
        storageDir,
        crawlRunId,
        category,
        snapshot,
      });
    },
  });
}

export async function assertSeededCategories(
  client: Pick<PrismaClient, "sourceCategory">,
): Promise<void> {
  const enabledCategoryCount = await client.sourceCategory.count({
    where: { enabled: true },
  });

  if (enabledCategoryCount === 0) {
    throw new Error("No enabled source categories found. Run `pnpm db:seed` before crawling.");
  }
}

async function readRawCategorySnapshot(
  rawDir: string,
  igrp: number,
  fetchedAt: Date,
  url: string,
  log: ((message: string) => void) | undefined,
): Promise<CoolpcCategorySnapshotInput> {
  const rawPath = join(rawDir, `igrp-${igrp}.html`);
  log?.(`Reading IGrp=${igrp} from ${rawPath}`);

  return {
    url,
    fetchedAt,
    httpStatus: 200,
    rawHtml: await readFile(rawPath, "utf8"),
  };
}

async function fetchLiveCategorySnapshot(
  igrp: number,
  fetchedAt: Date,
  url: string,
  userAgent: string,
  timeoutMs: number,
  log: ((message: string) => void) | undefined,
): Promise<CoolpcCategorySnapshotInput> {
  log?.(`Fetching IGrp=${igrp}: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
        "user-agent": userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const rawHtml = decodeCoolpcHtml(bytes);

    return {
      url,
      fetchedAt,
      httpStatus: response.status,
      rawHtml,
      fetchError: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      url,
      fetchedAt,
      httpStatus: null,
      rawHtml: null,
      fetchError: toErrorMessage(error),
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
