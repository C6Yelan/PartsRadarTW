// apps/crawler/src/scripts/ops/price-change-discord-notification.ts
import type { PrismaClient } from "@partsradar/db";
import {
  type DiscordWebhookMessage,
  type DiscordWebhookSendOptions,
  type DiscordWebhookSendResult,
  formatDiscordWebhookText,
  readDiscordWebhookUrl,
  sendDiscordWebhookMessage,
} from "./discord-webhook";
import { getStringArg } from "../shared/script-utils";

const DEFAULT_PUBLIC_BASE_URL = "https://partsradar.net";
export const DEFAULT_PRICE_CHANGE_DISCORD_MAX_ITEMS = 50;
export const MAX_PRICE_CHANGE_DISCORD_ITEMS = 200;
const MESSAGE_MAX_LENGTH = 1800;
const PRODUCT_NAME_MAX_LENGTH = 96;
const TIME_ZONE = "Asia/Taipei";

export interface PriceChangeDiscordNotificationOptions {
  publicWebhookUrl: string | null;
  publicBaseUrl: string;
  maxItems: number;
}

export interface PriceChangeDiscordNotificationItem {
  productId: string;
  productName: string;
  previousPrice: number;
  currentPrice: number;
  currency: string;
  changedAt: Date;
  delta: number;
}

export type PriceChangeDiscordNotificationSkipReason =
  | "missing_webhook_url"
  | "no_price_changes"
  | "sender_skipped";

export type PriceChangeDiscordNotificationResult =
  | {
      status: "skipped";
      reason: PriceChangeDiscordNotificationSkipReason;
      changeCount: number;
      listedCount: number;
      messageCount: number;
      snapshotCount?: number;
      unmatchedSnapshotCount?: number;
      unchangedSnapshotCount?: number;
      currencyMismatchCount?: number;
    }
  | {
      status: "sent";
      changeCount: number;
      listedCount: number;
      messageCount: number;
      httpStatuses: number[];
    }
  | {
      status: "rate_limited";
      changeCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      changeCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

export type PriceChangeDiscordClient = Pick<PrismaClient, "priceSnapshot">;

interface CrawlRunPriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: string;
  capturedAt: Date;
  product: {
    id: string;
    name: string;
  };
}

interface PreviousPriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: string;
  capturedAt: Date;
}

interface CrawlRunPriceChangeReadResult {
  changes: PriceChangeDiscordNotificationItem[];
  snapshotCount: number;
  unmatchedSnapshotCount: number;
  unchangedSnapshotCount: number;
  currencyMismatchCount: number;
}

export interface RecentPriceChangeOptions {
  since: Date;
  until?: Date;
}

export interface PriceChangeReportMessageOptions {
  publicBaseUrl: string;
  maxItems: number;
  title?: string;
  browseLabel?: string;
  hiddenLimitLabel?: string;
  emptyMessage?: string;
}

export function parsePriceChangeDiscordNotificationOptions(
  args: string[],
  env: NodeJS.ProcessEnv,
): PriceChangeDiscordNotificationOptions {
  return {
    publicWebhookUrl: readDiscordWebhookUrl(env, "DISCORD_PUBLIC_WEBHOOK_URL"),
    publicBaseUrl: normalizePublicBaseUrl(
      env.PARTSRADAR_PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL,
    ),
    maxItems: parseIntegerOption({
      args,
      env,
      argName: "--price-change-discord-max-items",
      envName: "PRICE_CHANGE_DISCORD_MAX_ITEMS",
      fallback: DEFAULT_PRICE_CHANGE_DISCORD_MAX_ITEMS,
      min: 1,
      max: MAX_PRICE_CHANGE_DISCORD_ITEMS,
    }),
  };
}

export async function sendCrawlRunPriceChangeDiscordNotification({
  client,
  crawlRunId,
  options,
  sendDiscordWebhook = sendDiscordWebhookMessage,
}: {
  client: PriceChangeDiscordClient;
  crawlRunId: string;
  options: PriceChangeDiscordNotificationOptions;
  sendDiscordWebhook?: (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>;
}): Promise<PriceChangeDiscordNotificationResult> {
  if (!options.publicWebhookUrl) {
    return {
      status: "skipped",
      reason: "missing_webhook_url",
      changeCount: 0,
      listedCount: 0,
      messageCount: 0,
    };
  }

  const readResult = await readCrawlRunPriceChangeSummary(client, crawlRunId);
  const { changes } = readResult;

  if (changes.length === 0) {
    return {
      status: "skipped",
      reason: "no_price_changes",
      changeCount: 0,
      listedCount: 0,
      messageCount: 0,
      snapshotCount: readResult.snapshotCount,
      unmatchedSnapshotCount: readResult.unmatchedSnapshotCount,
      unchangedSnapshotCount: readResult.unchangedSnapshotCount,
      currencyMismatchCount: readResult.currencyMismatchCount,
    };
  }

  const messages = createPriceChangeDiscordMessages(changes, options);
  const httpStatuses: number[] = [];

  for (const message of messages) {
    const result = await sendDiscordWebhook({
      webhookUrl: options.publicWebhookUrl,
      message,
    });

    if (result.status === "sent") {
      httpStatuses.push(result.httpStatus);
      continue;
    }

    if (result.status === "rate_limited") {
      return {
        status: "rate_limited",
        changeCount: changes.length,
        listedCount: Math.min(changes.length, options.maxItems),
        messageCount: messages.length,
        sentMessageCount: httpStatuses.length,
        retryAfterMs: result.retryAfterMs,
        global: result.global,
      };
    }

    if (result.status === "failed") {
      return {
        status: "failed",
        changeCount: changes.length,
        listedCount: Math.min(changes.length, options.maxItems),
        messageCount: messages.length,
        sentMessageCount: httpStatuses.length,
        httpStatus: result.httpStatus,
        message: result.message,
      };
    }

    return {
      status: "skipped",
      reason: "sender_skipped",
      changeCount: changes.length,
      listedCount: Math.min(changes.length, options.maxItems),
      messageCount: messages.length,
    };
  }

  return {
    status: "sent",
    changeCount: changes.length,
    listedCount: Math.min(changes.length, options.maxItems),
    messageCount: messages.length,
    httpStatuses,
  };
}

export async function readCrawlRunPriceChanges(
  client: PriceChangeDiscordClient,
  crawlRunId: string,
): Promise<PriceChangeDiscordNotificationItem[]> {
  return (await readCrawlRunPriceChangeSummary(client, crawlRunId)).changes;
}

export async function readCrawlRunPriceChangeSummary(
  client: PriceChangeDiscordClient,
  crawlRunId: string,
): Promise<CrawlRunPriceChangeReadResult> {
  const currentSnapshots = (await client.priceSnapshot.findMany({
    where: { crawlRunId },
    select: {
      id: true,
      productId: true,
      price: true,
      currency: true,
      capturedAt: true,
      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
  })) as CrawlRunPriceSnapshot[];

  if (currentSnapshots.length === 0) {
    return {
      changes: [],
      snapshotCount: 0,
      unmatchedSnapshotCount: 0,
      unchangedSnapshotCount: 0,
      currencyMismatchCount: 0,
    };
  }

  const productIds = [...new Set(currentSnapshots.map((snapshot) => snapshot.productId))];
  const latestCapturedAt = new Date(
    Math.max(...currentSnapshots.map((snapshot) => snapshot.capturedAt.getTime())),
  );
  const previousSnapshots = (await client.priceSnapshot.findMany({
    where: {
      productId: { in: productIds },
      crawlRunId: { not: crawlRunId },
      capturedAt: { lt: latestCapturedAt },
    },
    select: {
      id: true,
      productId: true,
      price: true,
      currency: true,
      capturedAt: true,
    },
    orderBy: [{ productId: "asc" }, { capturedAt: "desc" }, { id: "desc" }],
  })) as PreviousPriceSnapshot[];
  const previousByProduct = groupPreviousSnapshots(previousSnapshots);
  const changes: PriceChangeDiscordNotificationItem[] = [];
  let unmatchedSnapshotCount = 0;
  let unchangedSnapshotCount = 0;
  let currencyMismatchCount = 0;

  for (const current of currentSnapshots) {
    const previous = previousByProduct
      .get(current.productId)
      ?.find((snapshot) => snapshot.capturedAt.getTime() < current.capturedAt.getTime());

    if (!previous) {
      unmatchedSnapshotCount += 1;
      continue;
    }

    if (previous.currency !== current.currency) {
      currencyMismatchCount += 1;
      continue;
    }

    if (previous.price === current.price) {
      unchangedSnapshotCount += 1;
      continue;
    }

    changes.push({
      productId: current.product.id,
      productName: current.product.name,
      previousPrice: previous.price,
      currentPrice: current.price,
      currency: current.currency,
      changedAt: current.capturedAt,
      delta: current.price - previous.price,
    });
  }

  return {
    changes: changes.sort(comparePriceChanges),
    snapshotCount: currentSnapshots.length,
    unmatchedSnapshotCount,
    unchangedSnapshotCount,
    currencyMismatchCount,
  };
}

export async function readRecentPriceChanges(
  client: PriceChangeDiscordClient,
  { since, until = new Date() }: RecentPriceChangeOptions,
): Promise<PriceChangeDiscordNotificationItem[]> {
  if (since.getTime() >= until.getTime()) {
    return [];
  }

  const currentSnapshots = (await client.priceSnapshot.findMany({
    where: {
      capturedAt: {
        gte: since,
        lte: until,
      },
    },
    select: {
      id: true,
      productId: true,
      price: true,
      currency: true,
      capturedAt: true,
      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
  })) as CrawlRunPriceSnapshot[];

  if (currentSnapshots.length === 0) {
    return [];
  }

  const productIds = [...new Set(currentSnapshots.map((snapshot) => snapshot.productId))];
  const previousSnapshots = (await client.priceSnapshot.findMany({
    where: {
      productId: { in: productIds },
      capturedAt: { lt: until },
    },
    select: {
      id: true,
      productId: true,
      price: true,
      currency: true,
      capturedAt: true,
    },
    orderBy: [{ productId: "asc" }, { capturedAt: "desc" }, { id: "desc" }],
  })) as PreviousPriceSnapshot[];
  const previousByProduct = groupPreviousSnapshots(previousSnapshots);
  const latestChangeByProduct = new Map<string, PriceChangeDiscordNotificationItem>();

  for (const current of currentSnapshots) {
    const previous = previousByProduct
      .get(current.productId)
      ?.find((snapshot) => snapshot.capturedAt.getTime() < current.capturedAt.getTime());

    if (!previous || previous.price === current.price || previous.currency !== current.currency) {
      continue;
    }

    latestChangeByProduct.set(current.productId, {
      productId: current.product.id,
      productName: current.product.name,
      previousPrice: previous.price,
      currentPrice: current.price,
      currency: current.currency,
      changedAt: current.capturedAt,
      delta: current.price - previous.price,
    });
  }

  return [...latestChangeByProduct.values()].sort(comparePriceChanges);
}

export function createPriceChangeReportMessages(
  changes: PriceChangeDiscordNotificationItem[],
  options: PriceChangeReportMessageOptions,
): string[] {
  const title = options.title ?? "PartsRadarTW price report";

  if (changes.length === 0) {
    return [formatDiscordWebhookText(options.emptyMessage ?? `${title}\nNo price changes found.`)];
  }

  const listedChanges = changes.slice(0, options.maxItems);
  const hiddenCount = changes.length - listedChanges.length;
  const observedAt = new Date(
    Math.max(...listedChanges.map((change) => change.changedAt.getTime())),
  );
  const lines = listedChanges.map((change, index) =>
    formatPriceChangeLine({
      change,
      index,
      publicBaseUrl: options.publicBaseUrl,
    }),
  );
  const browseLine = `${options.browseLabel ?? "Browse"}: ${createProductsUrl(
    options.publicBaseUrl,
  )}`;
  const chunks = chunkLines(lines, {
    totalCount: changes.length,
    listedCount: listedChanges.length,
    hiddenCount,
    observedAt,
    publicBaseUrl: options.publicBaseUrl,
    title,
    browseLine,
    hiddenLimitLabel: options.hiddenLimitLabel ?? "report item limit",
  });

  return chunks.map((chunk, index) =>
    formatPriceChangeMessageContent({
      totalCount: changes.length,
      listedCount: listedChanges.length,
      hiddenCount,
      observedAt,
      chunk,
      partIndex: index + 1,
      partCount: chunks.length,
      title,
      browseLine,
      hiddenLimitLabel: options.hiddenLimitLabel ?? "report item limit",
    }),
  );
}

export function createPriceChangeDiscordMessages(
  changes: PriceChangeDiscordNotificationItem[],
  options: Pick<PriceChangeDiscordNotificationOptions, "publicBaseUrl" | "maxItems">,
): DiscordWebhookMessage[] {
  if (changes.length === 0) {
    return [];
  }

  const contents = createPriceChangeReportMessages(changes, {
    publicBaseUrl: options.publicBaseUrl,
    maxItems: options.maxItems,
    title: "PartsRadarTW price changes",
    browseLabel: "Browse",
    hiddenLimitLabel: "PRICE_CHANGE_DISCORD_MAX_ITEMS",
  });

  return contents.map((content) => ({
    username: "PartsRadarTW",
    content,
  }));
}

function groupPreviousSnapshots(
  snapshots: PreviousPriceSnapshot[],
): Map<string, PreviousPriceSnapshot[]> {
  const groups = new Map<string, PreviousPriceSnapshot[]>();

  for (const snapshot of snapshots) {
    const group = groups.get(snapshot.productId) ?? [];
    group.push(snapshot);
    groups.set(snapshot.productId, group);
  }

  return groups;
}

function comparePriceChanges(
  left: PriceChangeDiscordNotificationItem,
  right: PriceChangeDiscordNotificationItem,
): number {
  const deltaDiff = Math.abs(right.delta) - Math.abs(left.delta);

  if (deltaDiff !== 0) {
    return deltaDiff;
  }

  const timeDiff = right.changedAt.getTime() - left.changedAt.getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.productName.localeCompare(right.productName, "zh-Hant");
}

function chunkLines(
  lines: string[],
  context: {
    totalCount: number;
    listedCount: number;
    hiddenCount: number;
    observedAt: Date;
    publicBaseUrl: string;
    title: string;
    browseLine: string;
    hiddenLimitLabel: string;
  },
): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (const line of lines) {
    if (
      currentChunk.length > 0 &&
      formatPriceChangeMessageContent({
        ...context,
        chunk: [...currentChunk, line],
        partIndex: 1,
        partCount: 1,
      }).length > MESSAGE_MAX_LENGTH
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
    }

    currentChunk.push(line);
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function formatPriceChangeMessageContent({
  totalCount,
  listedCount,
  hiddenCount,
  observedAt,
  chunk,
  partIndex,
  partCount,
  title,
  browseLine,
  hiddenLimitLabel,
}: {
  totalCount: number;
  listedCount: number;
  hiddenCount: number;
  observedAt: Date;
  chunk: string[];
  partIndex: number;
  partCount: number;
  title: string;
  browseLine: string;
  hiddenLimitLabel: string;
}): string {
  return [
    createPriceChangeHeader({
      totalCount,
      listedCount,
      hiddenCount,
      observedAt,
      partIndex,
      partCount,
      title,
      hiddenLimitLabel,
    }),
    "",
    chunk.join("\n"),
    "",
    browseLine,
  ].join("\n");
}

function createPriceChangeHeader({
  totalCount,
  listedCount,
  hiddenCount,
  observedAt,
  partIndex,
  partCount,
  title,
  hiddenLimitLabel,
}: {
  totalCount: number;
  listedCount: number;
  hiddenCount: number;
  observedAt: Date;
  partIndex: number;
  partCount: number;
  title: string;
  hiddenLimitLabel: string;
}): string {
  const displayTitle = partCount > 1 ? `${title} (${partIndex}/${partCount})` : title;
  const countLine =
    hiddenCount > 0
      ? `Changes: ${totalCount}. Listed: ${listedCount}; ${hiddenCount} hidden by ${hiddenLimitLabel}.`
      : `Changes: ${totalCount}.`;

  return [displayTitle, `Observed at: ${formatTaipeiMinute(observedAt)}`, countLine].join("\n");
}

function formatPriceChangeLine({
  change,
  index,
  publicBaseUrl,
}: {
  change: PriceChangeDiscordNotificationItem;
  index: number;
  publicBaseUrl: string;
}): string {
  const productName = escapeMarkdownLinkText(
    formatDiscordWebhookText(toSingleLine(change.productName), PRODUCT_NAME_MAX_LENGTH),
  );
  const delta = formatSignedPrice(change.delta, change.currency);
  const previousPrice = formatPrice(change.previousPrice, change.currency);
  const currentPrice = formatPrice(change.currentPrice, change.currency);
  const productUrl = createProductUrl(publicBaseUrl, change.productId);

  return formatDiscordWebhookText(
    `${index + 1}. ${delta} | [${productName}](${productUrl}) | ${previousPrice} -> ${currentPrice}`,
    260,
  );
}

function formatPrice(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US")}`;
}

function formatSignedPrice(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : "-";

  return `${sign}${formatPrice(Math.abs(amount), currency)}`;
}

function formatTaipeiMinute(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("month")}/${byType.get("day")} ${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}

function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

function createProductsUrl(publicBaseUrl: string): string {
  return new URL("/", publicBaseUrl).toString();
}

export function normalizePublicBaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("PARTSRADAR_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PARTSRADAR_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }

  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";

  return url.toString();
}

function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = getStringArg(args, argName) ?? env[envName] ?? String(fallback);
  const message = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}
