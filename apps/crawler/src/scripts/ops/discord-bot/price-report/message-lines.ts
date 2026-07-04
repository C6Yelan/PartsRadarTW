// apps/crawler/src/scripts/ops/discord-bot/price-report/message-lines.ts
import type {
  PriceChangeDiscordNotificationItem,
  PriceReportNewProductItem,
  PriceReportProductCategory,
  PriceReportProductSubcategory,
  RecentPriceReport,
} from "../../price-change-discord-notification";
import { PRODUCT_NAME_MAX_LENGTH } from "../constants";
import { formatDiscordBotText } from "../rest";
import {
  createProductUrl,
  escapeMarkdownLinkText,
  escapeMarkdownText,
  formatSignedTaiwanDollar,
  formatTaiwanDollar,
  toSingleLine,
} from "./message-text";

export interface GroupedReportLineItem {
  category: PriceReportProductCategory;
  subcategory: PriceReportProductSubcategory | null;
  line: string;
}

export interface PriceChangeMovementGroup {
  kind: "drop" | "rise" | "other";
  title: string;
  count: number;
  lines: string[];
}

export interface PriceChangeMovementCounts {
  drop: number;
  rise: number;
  other: number;
}

export function countPriceChangeMovements(
  priceChanges: PriceChangeDiscordNotificationItem[],
): PriceChangeMovementCounts {
  return {
    drop: priceChanges.filter((change) => change.delta < 0).length,
    rise: priceChanges.filter((change) => change.delta > 0).length,
    other: priceChanges.filter((change) => change.delta === 0).length,
  };
}

export function createPriceChangeMovementGroups(
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

export function formatPriceChangeSummary(counts: PriceChangeMovementCounts): string {
  const parts = [`**降價 ${counts.drop}**`, `**漲價 ${counts.rise}**`];

  if (counts.other > 0) {
    parts.push(`**其他變動 ${counts.other}**`);
  }

  return parts.join("，");
}

export function formatPublicPriceReportSummary(
  report: Pick<RecentPriceReport, "priceChanges" | "newProducts">,
): string {
  const parts = [formatPriceChangeSummary(countPriceChangeMovements(report.priceChanges))];

  if (report.newProducts.length > 0) {
    parts.push(`**新增商品 ${report.newProducts.length}**`);
  }

  return parts.join("，");
}

export function formatPriceChangeSectionLines(groups: PriceChangeMovementGroup[]): string[] {
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

export function formatNewProductSectionLines(
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

export function formatGroupedReportLines(items: GroupedReportLineItem[]): string[] {
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

function formatReportSubcategoryHeading(subcategory: PriceReportProductSubcategory | null): string {
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

export function formatPersonalPriceChangeEmbedLine(
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

export function formatNewProductEmbedLine(
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
