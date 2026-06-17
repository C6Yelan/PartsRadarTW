// apps/crawler/src/scripts/ops/price-change-discord-notification/messages.ts

import {
  type DiscordWebhookEmbed,
  type DiscordWebhookMessage,
  formatDiscordWebhookText,
} from "../discord-webhook";
import { MESSAGE_MAX_LENGTH, PRODUCT_NAME_MAX_LENGTH, TIME_ZONE } from "./constants";
import type {
  PriceChangeDiscordNotificationItem,
  PriceChangeDiscordNotificationOptions,
  PriceChangeReportMessageOptions,
} from "./types";

const PRICE_CHANGE_EMBED_COLOR = 0x2563eb;
const DISCORD_EMBED_DESCRIPTION_TARGET_LENGTH = 3900;

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

  const embeds = createPriceChangeDiscordEmbeds(changes, {
    publicBaseUrl: options.publicBaseUrl,
    maxItems: options.maxItems,
    title: "PartsRadarTW price changes",
    browseLabel: "Browse",
    hiddenLimitLabel: "PRICE_CHANGE_DISCORD_MAX_ITEMS",
  });

  return embeds.map((embed) => ({
    username: "PartsRadarTW",
    embeds: [embed],
  }));
}

function createPriceChangeDiscordEmbeds(
  changes: PriceChangeDiscordNotificationItem[],
  options: PriceChangeReportMessageOptions,
): DiscordWebhookEmbed[] {
  const title = options.title ?? "PartsRadarTW price report";
  const listedChanges = changes.slice(0, options.maxItems);
  const hiddenCount = changes.length - listedChanges.length;
  const observedAt = new Date(
    Math.max(...listedChanges.map((change) => change.changedAt.getTime())),
  );
  const browseLine = `${options.browseLabel ?? "Browse"}: ${createProductsUrl(
    options.publicBaseUrl,
  )}`;
  const hiddenLimitLabel = options.hiddenLimitLabel ?? "report item limit";
  const lines = formatGroupedPriceChangeEmbedLines(listedChanges, options.publicBaseUrl);
  const chunks = chunkEmbedLines(lines, {
    totalCount: changes.length,
    listedCount: listedChanges.length,
    hiddenCount,
    observedAt,
    browseLine,
    hiddenLimitLabel,
  });

  return chunks.map((chunk, index) => ({
    title: chunks.length > 1 ? `${title} (${index + 1}/${chunks.length})` : title,
    description: formatPriceChangeEmbedDescription({
      totalCount: changes.length,
      listedCount: listedChanges.length,
      hiddenCount,
      observedAt,
      chunk,
      browseLine,
      hiddenLimitLabel,
    }),
    color: PRICE_CHANGE_EMBED_COLOR,
    timestamp: observedAt.toISOString(),
  }));
}

function chunkEmbedLines(
  lines: string[],
  context: {
    totalCount: number;
    listedCount: number;
    hiddenCount: number;
    observedAt: Date;
    browseLine: string;
    hiddenLimitLabel: string;
  },
): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (const line of lines) {
    if (
      currentChunk.length > 0 &&
      formatPriceChangeEmbedDescription({
        ...context,
        chunk: [...currentChunk, line],
      }).length > DISCORD_EMBED_DESCRIPTION_TARGET_LENGTH
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

function formatPriceChangeEmbedDescription({
  totalCount,
  listedCount,
  hiddenCount,
  observedAt,
  chunk,
  browseLine,
  hiddenLimitLabel,
}: {
  totalCount: number;
  listedCount: number;
  hiddenCount: number;
  observedAt: Date;
  chunk: string[];
  browseLine: string;
  hiddenLimitLabel: string;
}): string {
  return [
    `Observed at: ${formatTaipeiMinute(observedAt)}`,
    formatPriceChangeCountLine({
      totalCount,
      listedCount,
      hiddenCount,
      hiddenLimitLabel,
    }),
    "",
    chunk.join("\n"),
    "",
    browseLine,
  ].join("\n");
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
  const countLine = formatPriceChangeCountLine({
    totalCount,
    listedCount,
    hiddenCount,
    hiddenLimitLabel,
  });

  return [displayTitle, `Observed at: ${formatTaipeiMinute(observedAt)}`, countLine].join("\n");
}

function formatPriceChangeCountLine({
  totalCount,
  listedCount,
  hiddenCount,
  hiddenLimitLabel,
}: {
  totalCount: number;
  listedCount: number;
  hiddenCount: number;
  hiddenLimitLabel: string;
}): string {
  return hiddenCount > 0
    ? `Changes: ${totalCount}. Listed: ${listedCount}; ${hiddenCount} hidden by ${hiddenLimitLabel}.`
    : `Changes: ${totalCount}.`;
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

function formatGroupedPriceChangeEmbedLines(
  changes: PriceChangeDiscordNotificationItem[],
  publicBaseUrl: string,
): string[] {
  const items = changes.map((change) => ({
    category: change.category,
    subcategory: change.subcategory,
    line: formatPriceChangeEmbedLine({ change, publicBaseUrl }),
  }));
  const lines: string[] = [];
  const categoryGroups = groupReportItems(items, (item) => formatCategoryKey(item.category));

  for (const categoryItems of categoryGroups.values()) {
    const category = categoryItems[0]?.category;

    if (!category) {
      continue;
    }

    if (lines.length > 0) {
      lines.push("");
    }

    lines.push(`**${formatReportHeading(category.displayName)}**`);

    const subcategoryGroups = groupReportItems(categoryItems, (item) =>
      formatSubcategoryKey(item.subcategory),
    );

    for (const subcategoryItems of subcategoryGroups.values()) {
      const subcategory = subcategoryItems[0]?.subcategory;
      lines.push(formatReportSubcategoryHeading(subcategory));
      lines.push(...subcategoryItems.map((item) => item.line));
    }
  }

  return lines;
}

function formatPriceChangeEmbedLine({
  change,
  publicBaseUrl,
}: {
  change: PriceChangeDiscordNotificationItem;
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
    `- [${productName}](${productUrl}) ${previousPrice} -> ${currentPrice} (${delta})`,
    280,
  );
}

function groupReportItems<T>(items: T[], toKey: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = toKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

function formatCategoryKey(category: PriceChangeDiscordNotificationItem["category"]): string {
  return `${String(category.igrp).padStart(4, "0")}:${category.displayName}`;
}

function formatSubcategoryKey(
  subcategory: PriceChangeDiscordNotificationItem["subcategory"],
): string {
  return `${subcategory?.slug ?? "unknown"}:${subcategory?.displayName ?? "未分類"}`;
}

function formatReportSubcategoryHeading(
  subcategory: PriceChangeDiscordNotificationItem["subcategory"],
): string {
  return `_${formatReportHeading(subcategory?.displayName ?? "未分類")}_`;
}

function formatReportHeading(value: string): string {
  return escapeMarkdownText(formatDiscordWebhookText(toSingleLine(value), 80));
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

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}
