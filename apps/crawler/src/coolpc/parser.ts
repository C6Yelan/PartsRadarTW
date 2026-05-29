import { load, type CheerioAPI } from "cheerio";
import { decode } from "iconv-lite";

const COOLPC_SOURCE = "coolpc";
const DEFAULT_COOLPC_BASE_URL = "https://www.coolpc.com.tw";

export type Currency = "TWD";

export type ContentValidationStatus = "valid" | "invalid" | "suspected_block";

export type ParseErrorType =
  | "missing_ibuy_token"
  | "missing_name"
  | "invalid_image_url"
  | "price_parse_failed"
  | "duplicate_source_identity"
  | "content_validation_failed";

export interface SourceCategoryContext {
  sourceCategoryId: string;
  igrp: number;
  sourceName: string;
  displayName: string;
  fetchedAt: Date;
  sourceUrl?: string;
  expectedTitleKeywords?: string[];
}

export interface CoolpcProductCandidate {
  rawToken: string;
  rawName: string;
  rawPriceText: string;
  rawImageUrl: string;
}

export interface ParsedCoolpcProduct {
  sourceCategoryId: string;
  igrp: number;
  sourceName: string;
  displayName: string;
  ibuyToken: string;
  sourceItemKey: string;
  name: string;
  normalizedName: string;
  primaryImageUrl: string;
  price: number;
  currency: Currency;
  sourceUrl: string;
  fetchedAt: Date;
}

export interface CoolpcParseIssue {
  type: ParseErrorType;
  message: string;
  rawName?: string;
  rawPriceText?: string;
  rawImageUrl?: string;
  rawToken?: string;
  sourceItemKey?: string;
}

export interface ContentValidationResult {
  status: ContentValidationStatus;
  reason?: string;
  title: string;
  hasExpectedTitle: boolean;
  tokenCount: number;
  nameCount: number;
  priceTextCount: number;
  validCandidateCount: number;
}

export interface CoolpcParseResult {
  validation: ContentValidationResult;
  items: ParsedCoolpcProduct[];
  issues: CoolpcParseIssue[];
  deduplicatedItemCount: number;
  canImport: boolean;
}

export function decodeCoolpcHtml(buffer: Buffer | Uint8Array, encoding = "big5"): string {
  return decode(buffer, encoding);
}

export function createCoolpcCategoryUrl(igrp: number, baseUrl = DEFAULT_COOLPC_BASE_URL): string {
  const url = new URL("/eachview.php", baseUrl);
  url.searchParams.set("IGrp", String(igrp));
  return url.toString();
}

export function createSourceItemKey(igrp: number, ibuyToken: string): string {
  return `${COOLPC_SOURCE}:igrp:${igrp}:ibuy:${ibuyToken}`;
}

export function parsePriceText(rawPriceText: string): number | null {
  const match = rawPriceText.match(/(?:NT|\$)\s*([0-9][0-9,]*)/i);

  if (!match) {
    return null;
  }

  const price = Number.parseInt(match[1].replaceAll(",", ""), 10);
  return Number.isInteger(price) && price > 0 ? price : null;
}

export function normalizeProductName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function normalizeCoolpcProductImageUrl(
  rawImageUrl: string,
  igrp: number,
  baseUrl = DEFAULT_COOLPC_BASE_URL,
): string | null {
  if (!Number.isInteger(igrp) || igrp <= 0) {
    return null;
  }

  const trimmedImageUrl = rawImageUrl.trim();

  if (trimmedImageUrl.length === 0) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmedImageUrl, baseUrl);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  if (url.hostname !== "www.coolpc.com.tw") {
    return null;
  }

  const expectedPathPattern = new RegExp(
    `^/eval/${igrp}/[^/?#]+\\.(?:jpg|jpeg|png|gif|webp)$`,
    "i",
  );

  if (!expectedPathPattern.test(url.pathname)) {
    return null;
  }

  return `https://www.coolpc.com.tw${url.pathname}`;
}

export function validateCoolpcCategoryPage(
  html: string,
  context: SourceCategoryContext,
): ContentValidationResult {
  const $ = load(html);
  const title = $("title").first().text().trim();
  const hasExpectedTitle = expectedTitleKeywords(context).some((keyword) =>
    normalizeForComparison(title).includes(normalizeForComparison(keyword)),
  );
  const candidates = extractCoolpcProductCandidates($);
  const tokenCount = $("div.w").length;
  const nameCount = $("div.t").length;
  const priceTextCount = $("div.x").length;
  const validCandidateCount = candidates.filter(
    (candidate) =>
      candidate.rawToken.length > 0 &&
      candidate.rawName.length > 0 &&
      !isExplicitNonProductName(candidate.rawName) &&
      parsePriceText(candidate.rawPriceText) !== null,
  ).length;

  if (html.trim().length === 0) {
    return {
      status: "invalid",
      reason: "empty_content",
      title,
      hasExpectedTitle,
      tokenCount,
      nameCount,
      priceTextCount,
      validCandidateCount,
    };
  }

  // HTTP 200 alone is not trusted. A page with neither the expected title nor
  // product structures is treated as a possible block page, not as an empty category.
  if (!hasExpectedTitle && tokenCount === 0 && nameCount === 0 && priceTextCount === 0) {
    return {
      status: "suspected_block",
      reason: "not_expected_category_page",
      title,
      hasExpectedTitle,
      tokenCount,
      nameCount,
      priceTextCount,
      validCandidateCount,
    };
  }

  if (!hasExpectedTitle) {
    return {
      status: "invalid",
      reason: "missing_expected_title",
      title,
      hasExpectedTitle,
      tokenCount,
      nameCount,
      priceTextCount,
      validCandidateCount,
    };
  }

  if (tokenCount === 0 || nameCount === 0 || priceTextCount === 0) {
    return {
      status: "invalid",
      reason: "missing_required_product_structure",
      title,
      hasExpectedTitle,
      tokenCount,
      nameCount,
      priceTextCount,
      validCandidateCount,
    };
  }

  if (validCandidateCount === 0) {
    return {
      status: "invalid",
      reason: "no_valid_product_candidates",
      title,
      hasExpectedTitle,
      tokenCount,
      nameCount,
      priceTextCount,
      validCandidateCount,
    };
  }

  return {
    status: "valid",
    title,
    hasExpectedTitle,
    tokenCount,
    nameCount,
    priceTextCount,
    validCandidateCount,
  };
}

export function parseCoolpcCategoryPage(
  html: string,
  context: SourceCategoryContext,
): CoolpcParseResult {
  const validation = validateCoolpcCategoryPage(html, context);

  if (validation.status !== "valid") {
    return {
      validation,
      items: [],
      issues: [
        {
          type: "content_validation_failed",
          message: validation.reason ?? "content validation failed",
        },
      ],
      deduplicatedItemCount: 0,
      canImport: false,
    };
  }

  const $ = load(html);
  const candidates = extractCoolpcProductCandidates($);
  const items: ParsedCoolpcProduct[] = [];
  const issues: CoolpcParseIssue[] = [];
  const seenItemsBySourceKey = new Map<string, ParsedCoolpcProduct>();
  let deduplicatedItemCount = 0;
  let hasFatalIssue = false;

  for (const candidate of candidates) {
    const ibuyToken = candidate.rawToken.trim();
    const name = normalizeProductName(candidate.rawName);
    const price = parsePriceText(candidate.rawPriceText);
    const primaryImageUrl = normalizeCoolpcProductImageUrl(candidate.rawImageUrl, context.igrp);

    if (ibuyToken.length === 0) {
      issues.push({
        type: "missing_ibuy_token",
        message: "Product candidate is missing iBuy token.",
        rawName: candidate.rawName,
        rawPriceText: candidate.rawPriceText,
        rawToken: candidate.rawToken,
      });
      continue;
    }

    if (name.length === 0) {
      issues.push({
        type: "missing_name",
        message: "Product candidate is missing product name.",
        rawName: candidate.rawName,
        rawPriceText: candidate.rawPriceText,
        rawToken: ibuyToken,
      });
      continue;
    }

    if (isExplicitNonProductName(name)) {
      continue;
    }

    if (price === null) {
      issues.push({
        type: "price_parse_failed",
        message: "Product candidate price text could not be parsed.",
        rawName: name,
        rawPriceText: candidate.rawPriceText,
        rawToken: ibuyToken,
      });
      continue;
    }

    if (primaryImageUrl === null) {
      issues.push({
        type: "invalid_image_url",
        message: "Product candidate image URL is missing or not allowed.",
        rawName: name,
        rawPriceText: candidate.rawPriceText,
        rawImageUrl: candidate.rawImageUrl,
        rawToken: ibuyToken,
      });
      continue;
    }

    const sourceItemKey = createSourceItemKey(context.igrp, ibuyToken);
    const existingItem = seenItemsBySourceKey.get(sourceItemKey);

    if (existingItem) {
      // CoolPC can repeat the exact same row in one category page. Exact repeats
      // are harmless, but the same token with different data would corrupt identity.
      if (existingItem.name === name && existingItem.price === price) {
        deduplicatedItemCount += 1;
        continue;
      }

      hasFatalIssue = true;
      issues.push({
        type: "duplicate_source_identity",
        message: "Duplicate iBuy token in the same source category snapshot.",
        rawName: name,
        rawPriceText: candidate.rawPriceText,
        rawToken: ibuyToken,
        sourceItemKey,
      });
      continue;
    }

    const item: ParsedCoolpcProduct = {
      sourceCategoryId: context.sourceCategoryId,
      igrp: context.igrp,
      sourceName: context.sourceName,
      displayName: context.displayName,
      ibuyToken,
      sourceItemKey,
      name,
      normalizedName: normalizeProductName(name).toLocaleLowerCase("zh-TW"),
      primaryImageUrl,
      price,
      currency: "TWD",
      sourceUrl: sanitizeCoolpcSourceUrl(
        context.sourceUrl ?? createCoolpcCategoryUrl(context.igrp),
      ),
      fetchedAt: context.fetchedAt,
    };

    seenItemsBySourceKey.set(sourceItemKey, item);
    items.push(item);
  }

  return {
    validation,
    items,
    issues,
    deduplicatedItemCount,
    canImport: items.length > 0 && !hasFatalIssue,
  };
}

function extractCoolpcProductCandidates($: CheerioAPI): CoolpcProductCandidate[] {
  return $("div.w")
    .toArray()
    .map((element) => {
      const $token = $(element);
      // Live pages place product name/price near the token, but the immediate
      // wrapper differs between fixtures and full pages. Keep this traversal local.
      const $nextSpan = $token.nextAll("span").first();
      const $parent = $token.parent();
      const $following = $token.nextAll().slice(0, 4);
      const rawToken = $token.text().trim();
      const rawName = firstText($nextSpan, "div.t") || firstText($parent, "div.t");
      const rawPriceText = firstText($nextSpan, "div.x") || firstText($parent, "div.x");
      const rawImageUrl = firstAttr($nextSpan, "img", "src") || firstAttr($parent, "img", "src");

      return {
        rawToken,
        rawName: rawName || firstText($following, "div.t"),
        rawPriceText: rawPriceText || firstText($following, "div.x"),
        rawImageUrl: rawImageUrl || firstAttr($following, "img", "src"),
      };
    });
}

function firstText(scope: ReturnType<CheerioAPI>, selector: string): string {
  return scope.find(selector).first().text().trim();
}

function firstAttr(scope: ReturnType<CheerioAPI>, selector: string, attributeName: string): string {
  return scope.find(selector).first().attr(attributeName)?.trim() ?? "";
}

function expectedTitleKeywords(context: SourceCategoryContext): string[] {
  return context.expectedTitleKeywords ?? [context.sourceName, context.displayName];
}

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase("zh-TW");
}

function isExplicitNonProductName(name: string): boolean {
  const normalizedName = normalizeForComparison(normalizeProductName(name));

  return normalizedName.startsWith("【提醒】") || normalizedName.startsWith("[加購價]");
}

function sanitizeCoolpcSourceUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  // Session IDs are request state, not a stable product or category source URL.
  url.searchParams.delete("PHPSESSID");
  return url.toString();
}
