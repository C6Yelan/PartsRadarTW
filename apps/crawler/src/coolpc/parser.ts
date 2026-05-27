import { load, type CheerioAPI } from "cheerio";
import { decode } from "iconv-lite";

const COOLPC_SOURCE = "coolpc";
const DEFAULT_COOLPC_BASE_URL = "https://www.coolpc.com.tw";

export type Currency = "TWD";

export type ContentValidationStatus = "valid" | "invalid" | "suspected_block";

export type ParseErrorType =
  | "missing_ibuy_token"
  | "missing_name"
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

    const sourceItemKey = createSourceItemKey(context.igrp, ibuyToken);
    const existingItem = seenItemsBySourceKey.get(sourceItemKey);

    if (existingItem) {
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
      const $nextSpan = $token.nextAll("span").first();
      const $parent = $token.parent();
      const $following = $token.nextAll().slice(0, 4);
      const rawToken = $token.text().trim();
      const rawName = firstText($nextSpan, "div.t") || firstText($parent, "div.t");
      const rawPriceText = firstText($nextSpan, "div.x") || firstText($parent, "div.x");

      return {
        rawToken,
        rawName: rawName || firstText($following, "div.t"),
        rawPriceText: rawPriceText || firstText($following, "div.x"),
      };
    });
}

function firstText(scope: ReturnType<CheerioAPI>, selector: string): string {
  return scope.find(selector).first().text().trim();
}

function expectedTitleKeywords(context: SourceCategoryContext): string[] {
  return context.expectedTitleKeywords ?? [context.sourceName, context.displayName];
}

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase("zh-TW");
}

function sanitizeCoolpcSourceUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  url.searchParams.delete("PHPSESSID");
  return url.toString();
}
