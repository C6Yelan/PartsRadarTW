// apps/crawler/src/scripts/ops/discord-bot/price-report.ts

import type { DiscordPriceReportSetting } from "@partsradar/db";
import {
  readRecentPriceReport,
  type PriceChangeDiscordNotificationItem,
  type PriceReportNewProductItem,
  type PriceReportProductCategory,
  type PriceReportProductSubcategory,
  type RecentPriceReport,
} from "../price-change-discord-notification";
import {
  DAY_MS,
  DISCORD_EMBED_COLOR,
  DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
  HOUR_MS,
  MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE,
  MAX_PRICE_REPORT_ITEMS,
  PRODUCT_NAME_MAX_LENGTH,
  TIME_ZONE,
} from "./constants";
import { formatDiscordBotText } from "./rest";
import type {
  DiscordBotClient,
  DiscordBotEmbed,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordBotOptions,
  DiscordDirectMessageSendResult,
  PriceReportNowResult,
  PriceReportTimeOfDay,
} from "./types";

const TAIPEI_UTC_OFFSET_MS = 8 * HOUR_MS;
const DISCORD_MESSAGE_MAX_EMBEDS = 10;

export async function sendPriceReportNow({
  client,
  discordUserId,
  windowHours,
  maxItems,
  publicBaseUrl,
  now = new Date(),
  sendReportMessages,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  publicBaseUrl: string;
  now?: Date;
  sendReportMessages: (messages: DiscordBotMessage[]) => Promise<DiscordBotMessageSendResult>;
}): Promise<PriceReportNowResult> {
  return sendPriceReport({
    client,
    discordUserId,
    windowHours,
    maxItems,
    publicBaseUrl,
    now,
    deliveryKind: "PRICE_REPORT_NOW",
    sendReportMessages,
  });
}

async function sendPriceReport({
  client,
  discordUserId,
  windowHours,
  maxItems,
  publicBaseUrl,
  now,
  deliveryKind,
  sendReportMessages,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  publicBaseUrl: string;
  now: Date;
  deliveryKind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT";
  sendReportMessages: (messages: DiscordBotMessage[]) => Promise<DiscordBotMessageSendResult>;
}): Promise<PriceReportNowResult> {
  const since = new Date(now.getTime() - windowHours * HOUR_MS);
  const boundedMaxItems = clampPriceReportMaxItems(maxItems);
  const report = await readRecentPriceReport(client, { since, until: now });
  const listedCount = Math.min(
    report.priceChanges.length + report.newProducts.length,
    boundedMaxItems,
  );
  const messages = createPersonalPriceReportEmbedMessages(report, {
    publicBaseUrl,
    maxItems: boundedMaxItems,
    windowHours,
    generatedAt: now,
  });
  const result = await sendReportMessages(messages);

  await recordPriceReportDelivery({
    client,
    discordUserId,
    kind: deliveryKind,
    status: result.status,
    itemCount: listedCount,
    messageCount: messages.length,
    deliveredAt: result.status === "sent" ? now : null,
    errorMessage: result.status === "failed" ? result.message : null,
  });

  if (result.status === "sent") {
    return {
      status: "sent",
      changeCount: report.priceChanges.length,
      newProductCount: report.newProducts.length,
      listedCount,
      messageCount: messages.length,
    };
  }

  if (result.status === "rate_limited") {
    return {
      status: "rate_limited",
      changeCount: report.priceChanges.length,
      newProductCount: report.newProducts.length,
      listedCount,
      messageCount: messages.length,
      sentMessageCount: result.sentMessageCount,
      retryAfterMs: result.retryAfterMs,
      global: result.global,
    };
  }

  return {
    status: "failed",
    changeCount: report.priceChanges.length,
    newProductCount: report.newProducts.length,
    listedCount,
    messageCount: messages.length,
    sentMessageCount: result.sentMessageCount,
    httpStatus: result.httpStatus,
    message: result.message,
  };
}

export async function enableDailyPriceReport({
  client,
  discordUserId,
  windowHours,
  maxItems,
  timeOfDay = null,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  timeOfDay?: PriceReportTimeOfDay | null;
  now?: Date;
}): Promise<DiscordPriceReportSetting> {
  const nextSendAt = calculateNextSendAt(now, "DAILY", timeOfDay);

  return client.discordPriceReportSetting.upsert({
    where: {
      discordUserId,
    },
    create: {
      discordUserId,
      interval: "DAILY",
      window: toPriceReportWindow(windowHours),
      scope: "ALL",
      timezone: TIME_ZONE,
      maxItems: clampPriceReportMaxItems(maxItems),
      enabled: true,
      nextSendAt,
    },
    update: {
      interval: "DAILY",
      window: toPriceReportWindow(windowHours),
      scope: "ALL",
      timezone: TIME_ZONE,
      maxItems: clampPriceReportMaxItems(maxItems),
      enabled: true,
      nextSendAt,
    },
  });
}

export interface ScheduledPriceReportSummary {
  processedCount: number;
  sentCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

export async function sendDueScheduledPriceReports({
  client,
  options,
  now = new Date(),
  sendDirectMessages,
}: {
  client: DiscordBotClient;
  options: Pick<DiscordBotOptions, "publicBaseUrl" | "priceReportMaxItems">;
  now?: Date;
  sendDirectMessages: (
    discordUserId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<ScheduledPriceReportSummary> {
  const settings = await client.discordPriceReportSetting.findMany({
    where: {
      enabled: true,
      nextSendAt: {
        lte: now,
      },
    },
    orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
    take: MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE,
  });
  const summary: ScheduledPriceReportSummary = {
    processedCount: 0,
    sentCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  };

  for (const setting of settings) {
    summary.processedCount += 1;

    const result = await sendPriceReport({
      client,
      discordUserId: setting.discordUserId,
      windowHours: toWindowHours(setting.window),
      maxItems: clampPriceReportMaxItems(Math.min(setting.maxItems, options.priceReportMaxItems)),
      publicBaseUrl: options.publicBaseUrl,
      now,
      deliveryKind: "SCHEDULED_PRICE_REPORT",
      sendReportMessages: (messages) => sendDirectMessages(setting.discordUserId, messages),
    });

    if (result.status === "sent") {
      summary.sentCount += 1;
    } else if (result.status === "rate_limited") {
      summary.rateLimitedCount += 1;
    } else {
      summary.failedCount += 1;
    }

    await client.discordPriceReportSetting.update({
      where: {
        id: setting.id,
      },
      data: {
        lastSentAt: result.status === "sent" ? now : setting.lastSentAt,
        nextSendAt: calculateNextSendAtAfterScheduledRun(now, setting),
      },
    });
  }

  return summary;
}

export async function readNextScheduledPriceReportDueAt({
  client,
}: {
  client: DiscordBotClient;
}): Promise<Date | null> {
  const setting = await client.discordPriceReportSetting.findFirst({
    where: {
      enabled: true,
      nextSendAt: {
        not: null,
      },
    },
    select: {
      nextSendAt: true,
    },
    orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
  });

  return setting?.nextSendAt ?? null;
}

export function calculateScheduledPriceReportSleepMs({
  now,
  nextDueAt,
  maxSleepMs,
  minSleepMs = 1000,
}: {
  now: Date;
  nextDueAt: Date | null;
  maxSleepMs: number;
  minSleepMs?: number;
}): number {
  if (!nextDueAt) {
    return maxSleepMs;
  }

  const dueInMs = nextDueAt.getTime() - now.getTime();

  return Math.min(maxSleepMs, Math.max(minSleepMs, dueInMs));
}

export async function disablePriceReport({
  client,
  discordUserId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<number> {
  const result = await client.discordPriceReportSetting.updateMany({
    where: {
      discordUserId,
      enabled: true,
    },
    data: {
      enabled: false,
      nextSendAt: null,
    },
  });

  return result.count;
}

export async function readPriceReportSetting({
  client,
  discordUserId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<DiscordPriceReportSetting | null> {
  return client.discordPriceReportSetting.findUnique({
    where: {
      discordUserId,
    },
  });
}

async function recordPriceReportDelivery({
  client,
  discordUserId,
  kind,
  status,
  itemCount,
  messageCount,
  deliveredAt,
  errorMessage,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT";
  status: DiscordDirectMessageSendResult["status"];
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
}): Promise<void> {
  await client.discordNotificationDelivery.create({
    data: {
      discordUserId,
      kind,
      status: status === "sent" ? "SENT" : status === "rate_limited" ? "RATE_LIMITED" : "FAILED",
      itemCount,
      messageCount,
      deliveredAt,
      errorMessage,
    },
  });
}

function createPersonalPriceReportEmbedMessages(
  report: RecentPriceReport,
  options: {
    publicBaseUrl: string;
    maxItems: number;
    windowHours: number;
    generatedAt: Date;
  },
): DiscordBotMessage[] {
  const listedPriceChanges = report.priceChanges.slice(0, options.maxItems);
  const remainingItemLimit = Math.max(0, options.maxItems - listedPriceChanges.length);
  const listedNewProducts = report.newProducts.slice(0, remainingItemLimit);
  const hiddenPriceChangeCount = report.priceChanges.length - listedPriceChanges.length;
  const hiddenNewProductCount = report.newProducts.length - listedNewProducts.length;
  const embeds = createReportEmbeds({
    priceChangeCount: report.priceChanges.length,
    newProductCount: report.newProducts.length,
    windowHours: options.windowHours,
    listedPriceChanges,
    listedNewProducts,
    publicBaseUrl: options.publicBaseUrl,
    generatedAt: options.generatedAt,
    newProductLines: formatGroupedReportLines(
      listedNewProducts.map((product) => ({
        category: product.category,
        subcategory: product.subcategory,
        line: formatNewProductEmbedLine(product, options.publicBaseUrl),
      })),
    ),
    hiddenPriceChangeCount,
    hiddenNewProductCount,
    priceChangeMovementCounts: countPriceChangeMovements(report.priceChanges),
  });

  return createReportMessages(embeds);
}

function createReportEmbeds({
  priceChangeCount,
  newProductCount,
  windowHours,
  listedPriceChanges,
  listedNewProducts,
  publicBaseUrl,
  generatedAt,
  newProductLines,
  hiddenPriceChangeCount,
  hiddenNewProductCount,
  priceChangeMovementCounts,
}: {
  priceChangeCount: number;
  newProductCount: number;
  windowHours: number;
  listedPriceChanges: PriceChangeDiscordNotificationItem[];
  listedNewProducts: PriceReportNewProductItem[];
  publicBaseUrl: string;
  generatedAt: Date;
  newProductLines: string[];
  hiddenPriceChangeCount: number;
  hiddenNewProductCount: number;
  priceChangeMovementCounts: PriceChangeMovementCounts;
}): DiscordBotEmbed[] {
  const timestamp = generatedAt.toISOString();
  const priceChangeGroups = createPriceChangeMovementGroups(listedPriceChanges, publicBaseUrl);
  const embeds: DiscordBotEmbed[] = [];

  if (priceChangeCount > 0) {
    embeds.push(
      ...createReportSectionEmbeds({
        title: "PartsRadarTW 價格報告 - 價格變動",
        lines: [
          `過去 **${windowHours} 小時**：${formatPriceChangeSummary(priceChangeMovementCounts)}`,
          "",
          ...formatPriceChangeSectionLines(priceChangeGroups),
        ],
        footer: formatHiddenReportFooter({
          hiddenPriceChangeCount,
          hiddenNewProductCount: 0,
        }),
        timestamp,
      }),
    );
  }

  if (newProductCount > 0) {
    embeds.push(
      ...createReportSectionEmbeds({
        title: "PartsRadarTW 價格報告 - 新增商品",
        lines: [
          `過去 **${windowHours} 小時**：**${newProductCount} 個新增商品**`,
          "",
          ...formatNewProductSectionLines(
            newProductLines,
            listedNewProducts.length,
            newProductCount,
          ),
        ],
        footer: formatHiddenReportFooter({
          hiddenPriceChangeCount: 0,
          hiddenNewProductCount,
        }),
        timestamp,
      }),
    );
  }

  if (embeds.length === 0) {
    embeds.push({
      title: "PartsRadarTW 價格報告",
      description: `過去 ${windowHours} 小時沒有價格變動或新增商品。`,
      color: DISCORD_EMBED_COLOR,
      timestamp,
    });
  }

  return embeds;
}

function createReportSectionEmbeds({
  title,
  lines,
  footer,
  timestamp,
}: {
  title: string;
  lines: string[];
  footer: string | null;
  timestamp: string;
}): DiscordBotEmbed[] {
  const descriptionChunks = createReportDescriptionChunks(lines);

  return descriptionChunks.map((description, index) => ({
    title:
      descriptionChunks.length > 1 ? `${title} (${index + 1}/${descriptionChunks.length})` : title,
    description,
    color: DISCORD_EMBED_COLOR,
    footer: footer && index === descriptionChunks.length - 1 ? { text: footer } : undefined,
    timestamp,
  }));
}

function createReportDescriptionChunks(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const formattedLine = formatDiscordBotText(line, DISCORD_EMBED_DESCRIPTION_MAX_LENGTH);
    const next = current ? `${current}\n${formattedLine}` : formattedLine;

    if (current && next.length > DISCORD_EMBED_DESCRIPTION_MAX_LENGTH) {
      chunks.push(current);
      current = formattedLine;
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function createReportMessages(embeds: DiscordBotEmbed[]): DiscordBotMessage[] {
  const messages: DiscordBotMessage[] = [];

  for (let index = 0; index < embeds.length; index += DISCORD_MESSAGE_MAX_EMBEDS) {
    messages.push({
      embeds: embeds.slice(index, index + DISCORD_MESSAGE_MAX_EMBEDS),
    });
  }

  return messages;
}

interface GroupedReportLineItem {
  category: PriceReportProductCategory;
  subcategory: PriceReportProductSubcategory | null;
  line: string;
}

interface PriceChangeMovementGroup {
  kind: "drop" | "rise" | "other";
  title: string;
  count: number;
  lines: string[];
}

interface PriceChangeMovementCounts {
  drop: number;
  rise: number;
  other: number;
}

function countPriceChangeMovements(
  priceChanges: PriceChangeDiscordNotificationItem[],
): PriceChangeMovementCounts {
  return {
    drop: priceChanges.filter((change) => change.delta < 0).length,
    rise: priceChanges.filter((change) => change.delta > 0).length,
    other: priceChanges.filter((change) => change.delta === 0).length,
  };
}

function createPriceChangeMovementGroups(
  priceChanges: PriceChangeDiscordNotificationItem[],
  publicBaseUrl: string,
): PriceChangeMovementGroup[] {
  return [
    createPriceChangeMovementGroup({
      kind: "drop",
      title: "降價",
      priceChanges: priceChanges.filter((change) => change.delta < 0),
      publicBaseUrl,
    }),
    createPriceChangeMovementGroup({
      kind: "rise",
      title: "漲價",
      priceChanges: priceChanges.filter((change) => change.delta > 0),
      publicBaseUrl,
    }),
    createPriceChangeMovementGroup({
      kind: "other",
      title: "其他變動",
      priceChanges: priceChanges.filter((change) => change.delta === 0),
      publicBaseUrl,
    }),
  ];
}

function createPriceChangeMovementGroup({
  kind,
  title,
  priceChanges,
  publicBaseUrl,
}: {
  kind: PriceChangeMovementGroup["kind"];
  title: string;
  priceChanges: PriceChangeDiscordNotificationItem[];
  publicBaseUrl: string;
}): PriceChangeMovementGroup {
  return {
    kind,
    title,
    count: priceChanges.length,
    lines: formatGroupedReportLines(
      priceChanges.map((change) => ({
        category: change.category,
        subcategory: change.subcategory,
        line: formatPersonalPriceChangeEmbedLine(change, publicBaseUrl),
      })),
    ),
  };
}

function formatPriceChangeSummary(counts: PriceChangeMovementCounts): string {
  const parts = [`**降價 ${counts.drop}**`, `**漲價 ${counts.rise}**`];

  if (counts.other > 0) {
    parts.push(`**其他變動 ${counts.other}**`);
  }

  return parts.join("，");
}

function formatPriceChangeSectionLines(groups: PriceChangeMovementGroup[]): string[] {
  const lines: string[] = [];

  for (const group of groups) {
    if (group.lines.length === 0) {
      continue;
    }

    if (lines.length > 0) {
      lines.push("");
    }

    lines.push(`__**${group.title} (${group.count})**__`, ...group.lines);
  }

  if (lines.length === 0) {
    lines.push("本次項目上限已用完，未列出價格變動。");
  }

  return lines;
}

function formatNewProductSectionLines(
  newProductLines: string[],
  listedNewProductCount: number,
  totalNewProductCount: number,
): string[] {
  if (totalNewProductCount === 0) {
    return ["沒有新增商品。"];
  }

  if (listedNewProductCount === 0) {
    return ["本次項目上限已用完，未列出新增商品。"];
  }

  return newProductLines;
}

function formatGroupedReportLines(items: GroupedReportLineItem[]): string[] {
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
      if (shouldShowReportSubcategoryHeading(subcategory)) {
        lines.push(formatReportSubcategoryHeading(subcategory));
      }
      lines.push(...subcategoryItems.map((item) => item.line));
    }
  }

  return lines;
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

function formatCategoryKey(category: PriceReportProductCategory): string {
  return `${String(category.igrp).padStart(4, "0")}:${category.displayName}`;
}

function formatSubcategoryKey(subcategory: PriceReportProductSubcategory | null): string {
  return `${subcategory?.slug ?? "unknown"}:${subcategory?.displayName ?? "未分類"}`;
}

function formatReportSubcategoryHeading(
  subcategory: PriceReportProductSubcategory | null,
): string {
  return `**${formatReportHeading(subcategory?.displayName ?? "未分類")}**`;
}

function shouldShowReportSubcategoryHeading(
  subcategory: PriceReportProductSubcategory | null,
): boolean {
  return Boolean(subcategory?.displayName && subcategory.displayName !== "未分類");
}

function formatReportHeading(value: string): string {
  return escapeMarkdownText(formatDiscordBotText(toSingleLine(value), 80));
}

function formatReportProductLinkText(
  productName: string,
  subcategory: PriceReportProductSubcategory | null,
): string {
  const reportProductName = stripLeadingSubcategoryName(toSingleLine(productName), subcategory);

  return escapeMarkdownLinkText(formatDiscordBotText(reportProductName, PRODUCT_NAME_MAX_LENGTH));
}

function stripLeadingSubcategoryName(
  productName: string,
  subcategory: PriceReportProductSubcategory | null,
): string {
  const subcategoryName = toSingleLine(subcategory?.displayName ?? "");

  if (!subcategoryName || subcategoryName === "未分類") {
    return productName;
  }

  if (!productName.toLocaleLowerCase().startsWith(subcategoryName.toLocaleLowerCase())) {
    return productName;
  }

  const strippedName = productName
    .slice(subcategoryName.length)
    .replace(/^[\s:：\-–—_/／]+/, "")
    .trim();

  return strippedName || productName;
}

function formatPersonalPriceChangeEmbedLine(
  change: PriceChangeDiscordNotificationItem,
  publicBaseUrl: string,
): string {
  const productName = formatReportProductLinkText(change.productName, change.subcategory);
  const productUrl = createProductUrl(publicBaseUrl, change.productId);
  const delta = formatSignedTaiwanDollar(change.delta, change.currency);

  return formatDiscordBotText(
    `- **${delta}** ${formatTaiwanDollar(change.previousPrice, change.currency)} -> ${formatTaiwanDollar(
      change.currentPrice,
      change.currency,
    )} [${productName}](${productUrl})`,
    320,
  );
}

function formatNewProductEmbedLine(
  product: PriceReportNewProductItem,
  publicBaseUrl: string,
): string {
  const productName = formatReportProductLinkText(product.productName, product.subcategory);
  const productUrl = createProductUrl(publicBaseUrl, product.productId);

  return formatDiscordBotText(
    `- **${formatTaiwanDollar(product.currentPrice, product.currency)}** [${productName}](${productUrl})`,
    280,
  );
}

function calculateNextSendAt(
  now: Date,
  interval: DiscordPriceReportSetting["interval"],
  timeOfDay: PriceReportTimeOfDay | null = null,
): Date {
  if (interval === "DAILY" && timeOfDay) {
    return calculateNextDailySendAt(now, timeOfDay);
  }

  const intervalMs =
    interval === "EVERY_6H" ? 6 * HOUR_MS : interval === "EVERY_12H" ? 12 * HOUR_MS : DAY_MS;

  return new Date(now.getTime() + intervalMs);
}

function calculateNextSendAtAfterScheduledRun(
  now: Date,
  setting: Pick<DiscordPriceReportSetting, "interval" | "nextSendAt">,
): Date {
  const intervalMs =
    setting.interval === "EVERY_6H"
      ? 6 * HOUR_MS
      : setting.interval === "EVERY_12H"
        ? 12 * HOUR_MS
        : DAY_MS;

  if (!setting.nextSendAt) {
    return new Date(now.getTime() + intervalMs);
  }

  let nextSendAt = new Date(setting.nextSendAt.getTime() + intervalMs);

  while (nextSendAt.getTime() <= now.getTime()) {
    nextSendAt = new Date(nextSendAt.getTime() + intervalMs);
  }

  return nextSendAt;
}

function calculateNextDailySendAt(now: Date, timeOfDay: PriceReportTimeOfDay): Date {
  const todaySendAt = createTaipeiDateTimeUtc(now, timeOfDay);

  return todaySendAt.getTime() > now.getTime()
    ? todaySendAt
    : new Date(todaySendAt.getTime() + DAY_MS);
}

function createTaipeiDateTimeUtc(reference: Date, timeOfDay: PriceReportTimeOfDay): Date {
  const taipeiReference = new Date(reference.getTime() + TAIPEI_UTC_OFFSET_MS);

  return new Date(
    Date.UTC(
      taipeiReference.getUTCFullYear(),
      taipeiReference.getUTCMonth(),
      taipeiReference.getUTCDate(),
      timeOfDay.hour,
      timeOfDay.minute,
    ) - TAIPEI_UTC_OFFSET_MS,
  );
}

function toPriceReportWindow(windowHours: number): DiscordPriceReportSetting["window"] {
  if (windowHours === 6) {
    return "HOURS_6";
  }

  if (windowHours === 12) {
    return "HOURS_12";
  }

  return "HOURS_24";
}

function toWindowHours(window: DiscordPriceReportSetting["window"]): number {
  if (window === "HOURS_6") {
    return 6;
  }

  if (window === "HOURS_12") {
    return 12;
  }

  return 24;
}

function clampPriceReportMaxItems(value: number): number {
  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}

export function formatPriceReportSettingMessage(setting: DiscordPriceReportSetting | null): string {
  if (!setting?.enabled) {
    return "尚未開啟每日價格提醒。使用下方按鈕可開啟每日私訊報告。";
  }

  return [
    "每日價格提醒已開啟。",
    `統計區間：${formatWindowLabel(setting.window)}`,
    `每次最多：${setting.maxItems} 筆`,
    `每日時間：${formatTaipeiTime(setting.nextSendAt)}`,
    `下一次：${formatTaipeiMinute(setting.nextSendAt)}`,
  ].join("\n");
}

export function formatWindowLabel(window: DiscordPriceReportSetting["window"]): string {
  return `過去 ${toWindowHours(window)} 小時`;
}

export function formatTaipeiMinute(value: Date | null): string {
  if (!value) {
    return "尚未排程";
  }

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

function formatTaipeiTime(value: Date | null): string {
  if (!value) {
    return "尚未排程";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}

function formatTaiwanDollar(amount: number, currency: string): string {
  if (currency === "TWD") {
    return `NT$${amount.toLocaleString("en-US")}`;
  }

  return `${currency} ${amount.toLocaleString("en-US")}`;
}

function formatSignedTaiwanDollar(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";

  return `${sign}${formatTaiwanDollar(Math.abs(amount), currency)}`;
}

function formatHiddenReportFooter({
  hiddenPriceChangeCount,
  hiddenNewProductCount,
}: {
  hiddenPriceChangeCount: number;
  hiddenNewProductCount: number;
}): string | null {
  const parts = [
    hiddenPriceChangeCount > 0 ? `另有 ${hiddenPriceChangeCount} 筆價格變動未列出` : null,
    hiddenNewProductCount > 0 ? `另有 ${hiddenNewProductCount} 個新增商品未列出` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join("，") : null;
}

function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\*_~`|[\]])/g, "\\$1");
}
