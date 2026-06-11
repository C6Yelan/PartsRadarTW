// apps/crawler/src/scripts/ops/discord-bot/price-report.ts

import type { DiscordPriceReportSetting } from "@partsradar/db";
import {
  readRecentPriceReport,
  type PriceChangeDiscordNotificationItem,
  type PriceReportNewProductItem,
  type RecentPriceReport,
} from "../price-change-discord-notification";
import {
  DAY_MS,
  DISCORD_EMBED_COLOR,
  DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
  DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH,
  DISCORD_EMBED_MAX_FIELDS,
  HOUR_MS,
  MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE,
  MAX_PRICE_REPORT_ITEMS,
  PRODUCT_NAME_MAX_LENGTH,
  TIME_ZONE,
} from "./constants";
import { formatDiscordBotText } from "./rest";
import type {
  DiscordBotClient,
  DiscordBotEmbedField,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordBotOptions,
  DiscordDirectMessageSendResult,
  PriceReportNowResult,
} from "./types";

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
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  now?: Date;
}): Promise<DiscordPriceReportSetting> {
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
      nextSendAt: calculateNextSendAt(now, "DAILY"),
    },
    update: {
      interval: "DAILY",
      window: toPriceReportWindow(windowHours),
      scope: "ALL",
      timezone: TIME_ZONE,
      maxItems: clampPriceReportMaxItems(maxItems),
      enabled: true,
      nextSendAt: calculateNextSendAt(now, "DAILY"),
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
        nextSendAt: calculateNextSendAt(now, setting.interval),
      },
    });
  }

  return summary;
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
  const fields = [
    ...createReportSectionFields({
      title: `價格變動 (${report.priceChanges.length})`,
      emptyText: "沒有價格變動。",
      lines: listedPriceChanges.map((change) =>
        formatPersonalPriceChangeEmbedLine(change, options.publicBaseUrl),
      ),
    }),
    ...createReportSectionFields({
      title: `新增商品 (${report.newProducts.length})`,
      emptyText: "沒有新增商品。",
      lines: listedNewProducts.map((product) =>
        formatNewProductEmbedLine(product, options.publicBaseUrl),
      ),
    }),
  ];
  const fieldChunks = chunkArray(fields, DISCORD_EMBED_MAX_FIELDS);
  const footer = formatHiddenReportFooter({
    hiddenPriceChangeCount,
    hiddenNewProductCount,
  });
  const chunks = fieldChunks.length > 0 ? fieldChunks : [[{ name: "價格報告", value: "沒有資料。" }]];

  return chunks.map((chunk, index) => ({
    embeds: [
      {
        title:
          chunks.length > 1
            ? `PartsRadarTW 價格報告 (${index + 1}/${chunks.length})`
            : "PartsRadarTW 價格報告",
        description: formatDiscordBotText(
          `過去 ${options.windowHours} 小時：價格變動 ${report.priceChanges.length}，新增商品 ${report.newProducts.length}`,
          DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
        ),
        color: DISCORD_EMBED_COLOR,
        fields: chunk,
        footer: footer ? { text: footer } : undefined,
        timestamp: options.generatedAt.toISOString(),
      },
    ],
  }));
}

function createReportSectionFields({
  title,
  emptyText,
  lines,
}: {
  title: string;
  emptyText: string;
  lines: string[];
}): DiscordBotEmbedField[] {
  if (lines.length === 0) {
    return [
      {
        name: title,
        value: emptyText,
      },
    ];
  }

  return chunkFieldValueLines(lines).map((value, index) => ({
    name: index === 0 ? title : `${title} 續`,
    value,
  }));
}

function chunkFieldValueLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;

    if (current && next.length > DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH) {
      chunks.push(current);
      current = line;
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function formatPersonalPriceChangeEmbedLine(
  change: PriceChangeDiscordNotificationItem,
  publicBaseUrl: string,
): string {
  const productName = escapeMarkdownLinkText(
    formatDiscordBotText(toSingleLine(change.productName), PRODUCT_NAME_MAX_LENGTH),
  );
  const productUrl = createProductUrl(publicBaseUrl, change.productId);

  return formatDiscordBotText(
    `- [${productName}](${productUrl}) ${formatTaiwanDollar(
      change.previousPrice,
      change.currency,
    )} -> ${formatTaiwanDollar(change.currentPrice, change.currency)} (${formatSignedTaiwanDollar(
      change.delta,
      change.currency,
    )})`,
    280,
  );
}

function formatNewProductEmbedLine(
  product: PriceReportNewProductItem,
  publicBaseUrl: string,
): string {
  const productName = escapeMarkdownLinkText(
    formatDiscordBotText(toSingleLine(product.productName), PRODUCT_NAME_MAX_LENGTH),
  );
  const productUrl = createProductUrl(publicBaseUrl, product.productId);

  return formatDiscordBotText(
    `- [${productName}](${productUrl}) ${formatTaiwanDollar(product.currentPrice, product.currency)}`,
    240,
  );
}

function calculateNextSendAt(now: Date, interval: DiscordPriceReportSetting["interval"]): Date {
  const intervalMs =
    interval === "EVERY_6H" ? 6 * HOUR_MS : interval === "EVERY_12H" ? 12 * HOUR_MS : DAY_MS;

  return new Date(now.getTime() + intervalMs);
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
    return "尚未開啟每日價格提醒。使用 `/price-report enable` 可開啟每日私訊報告。";
  }

  return [
    "每日價格提醒已開啟。",
    `統計區間：${formatWindowLabel(setting.window)}`,
    `每次最多：${setting.maxItems} 筆`,
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

function formatTaiwanDollar(amount: number, currency: string): string {
  if (currency === "TWD") {
    return `NT$${amount.toLocaleString("en-US")}`;
  }

  return `${currency} ${amount.toLocaleString("en-US")}`;
}

function formatSignedTaiwanDollar(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : "-";

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

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
