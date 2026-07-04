// apps/crawler/src/scripts/ops/discord-bot/price-report/messages.ts
import type {
  PriceReportPriceChangeItem,
  PriceReportNewProductItem,
  RecentPriceReport,
} from "./reader-types";
import { DISCORD_EMBED_COLOR } from "../constants";
import type { DiscordBotEmbed, DiscordBotMessage } from "../types";
import { clampPriceReportMaxItems } from "./limits";
import {
  countPriceChangeMovements,
  createPriceChangeMovementGroups,
  formatGroupedReportLines,
  formatNewProductEmbedLine,
  formatNewProductSectionLines,
  formatPriceChangeSectionLines,
  formatPriceChangeSummary,
  formatPublicPriceReportSummary,
  type PriceChangeMovementCounts,
} from "./message-lines";
import { createReportMessages, createReportSectionEmbeds } from "./message-layout";

export function createPublicPriceChangeReportMessages(
  priceChanges: PriceReportPriceChangeItem[],
  options: {
    publicBaseUrl: string;
    maxItems: number;
    generatedAt: Date;
  },
): DiscordBotMessage[] {
  return createPublicPriceReportMessages(
    {
      priceChanges,
      newProducts: [],
    },
    options,
  );
}

export function createPublicPriceReportMessages(
  report: Pick<RecentPriceReport, "priceChanges" | "newProducts">,
  options: {
    publicBaseUrl: string;
    maxItems: number;
    generatedAt: Date;
  },
): DiscordBotMessage[] {
  if (report.priceChanges.length === 0 && report.newProducts.length === 0) {
    return [];
  }

  const boundedMaxItems = clampPriceReportMaxItems(options.maxItems);
  const listedPriceChanges = report.priceChanges.slice(0, boundedMaxItems);
  const remainingItemLimit = Math.max(0, boundedMaxItems - listedPriceChanges.length);
  const listedNewProducts = report.newProducts.slice(0, remainingItemLimit);
  const hiddenPriceChangeCount = report.priceChanges.length - listedPriceChanges.length;
  const hiddenNewProductCount = report.newProducts.length - listedNewProducts.length;
  const timestamp = options.generatedAt.toISOString();
  const embeds: DiscordBotEmbed[] = [];

  if (report.priceChanges.length > 0) {
    embeds.push(
      ...createReportSectionEmbeds({
        title: "PartsRadarTW 公開價格報告 - 價格變動",
        lines: [
          `本輪更新：${formatPublicPriceReportSummary(report)}`,
          "",
          ...formatPriceChangeSectionLines(
            createPriceChangeMovementGroups(listedPriceChanges, options.publicBaseUrl),
          ),
        ],
        footer: formatHiddenReportFooter({
          hiddenPriceChangeCount,
          hiddenNewProductCount: 0,
        }),
        timestamp,
      }),
    );
  }

  if (report.newProducts.length > 0) {
    embeds.push(
      ...createReportSectionEmbeds({
        title: "PartsRadarTW 公開價格報告 - 新增商品",
        lines: [
          `本輪更新：**${report.newProducts.length} 個新增商品**`,
          "",
          ...formatNewProductSectionLines(
            formatGroupedReportLines(
              listedNewProducts.map((product) => ({
                category: product.category,
                subcategory: product.subcategory,
                line: formatNewProductEmbedLine(product, options.publicBaseUrl),
              })),
            ),
            listedNewProducts.length,
            report.newProducts.length,
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

  return createReportMessages(embeds);
}

export function createPersonalPriceReportEmbedMessages(
  report: RecentPriceReport,
  options: {
    publicBaseUrl: string;
    maxItems: number;
    windowHours: number;
    generatedAt: Date;
    hasActiveFilters: boolean;
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
    hasActiveFilters: options.hasActiveFilters,
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
  hasActiveFilters,
}: {
  priceChangeCount: number;
  newProductCount: number;
  windowHours: number;
  listedPriceChanges: PriceReportPriceChangeItem[];
  listedNewProducts: PriceReportNewProductItem[];
  publicBaseUrl: string;
  generatedAt: Date;
  newProductLines: string[];
  hiddenPriceChangeCount: number;
  hiddenNewProductCount: number;
  priceChangeMovementCounts: PriceChangeMovementCounts;
  hasActiveFilters: boolean;
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
      description: hasActiveFilters
        ? `過去 ${windowHours} 小時沒有符合篩選的價格變動或新增商品。`
        : `過去 ${windowHours} 小時沒有價格變動或新增商品。`,
      color: DISCORD_EMBED_COLOR,
      timestamp,
    });
  }

  return embeds;
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
