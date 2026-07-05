// apps/crawler/src/coolpc/parser.ts
import { load } from "cheerio";
import { decode } from "iconv-lite";
import { extractCoolpcProductCandidates } from "./parser/candidates";
import { validateCoolpcCategoryPage } from "./parser/content-validation";
import {
  isExplicitNonProductName,
  normalizeProductName,
  parsePriceText,
} from "./parser/normalization";
import type {
  CoolpcParseIssue,
  CoolpcParseResult,
  ParsedCoolpcProduct,
  SourceCategoryContext,
} from "./parser/types";
import {
  createCoolpcCategoryUrl,
  createCoolpcSourceProductKey,
  normalizeCoolpcProductImageUrl,
  sanitizeCoolpcSourceCategoryUrl,
} from "./parser/urls";
import { classifyProductVendor } from "./vendor-classification";

export type {
  ContentValidationResult,
  ContentValidationStatus,
  CoolpcParseIssue,
  CoolpcParseResult,
  CoolpcProductCandidate,
  Currency,
  ParsedCoolpcProduct,
  ParseErrorType,
  SourceCategoryContext,
} from "./parser/types";
export { validateCoolpcCategoryPage } from "./parser/content-validation";
export {
  normalizeProductName,
  parsePriceText,
} from "./parser/normalization";
export {
  createCoolpcCategoryUrl,
  createCoolpcSourceProductKey,
  normalizeCoolpcProductImageUrl,
} from "./parser/urls";

export function decodeCoolpcHtml(buffer: Buffer | Uint8Array, encoding = "big5"): string {
  return decode(buffer, encoding);
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
    }

    const sourceProductKey = createCoolpcSourceProductKey(context.igrp, ibuyToken);
    const existingItem = seenItemsBySourceKey.get(sourceProductKey);

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
        sourceItemKey: sourceProductKey,
      });
      continue;
    }

    const vendor = classifyProductVendor(context.igrp, name);
    const item: ParsedCoolpcProduct = {
      sourceCategoryId: context.sourceCategoryId,
      igrp: context.igrp,
      sourceName: context.sourceName,
      displayName: context.displayName,
      ibuyToken,
      sourceItemKey: sourceProductKey,
      name,
      normalizedName: normalizeProductName(name).toLocaleLowerCase("zh-TW"),
      vendorSlug: vendor?.slug ?? null,
      vendorName: vendor?.name ?? null,
      primaryImageUrl,
      price,
      currency: "TWD",
      sourceUrl: sanitizeCoolpcSourceCategoryUrl(
        context.sourceCategoryUrl ?? createCoolpcCategoryUrl(context.igrp),
      ),
      fetchedAt: context.fetchedAt,
    };

    seenItemsBySourceKey.set(sourceProductKey, item);
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
