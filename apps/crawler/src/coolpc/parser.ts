// apps/crawler/src/coolpc/parser.ts
// CoolPC parser 入口，負責把分類頁 HTML 轉成 parsed products 與 issues 清單；
// 同時重用 parser helpers 做頁面驗證、候選擷取、欄位正規化與 vendor 分類判斷。

import {
  createCoolpcCategoryUrl,
  extractProductFilterTags,
  MAX_PRODUCT_NAME_LENGTH,
  mergeProductFilterTags,
  normalizeBoundedProductName,
} from "@partsradar/shared";
import { load } from "cheerio";
import { decode } from "iconv-lite";
import { normalizeFilterSyncProductName } from "./filter-sync/parser";
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
  ExcludedCoolpcProduct,
  ParsedCoolpcProduct,
  ProductExclusionReason,
  SourceCategoryContext,
} from "./parser/types";
import {
  createCoolpcSourceProductKey,
  normalizeCoolpcProductImageUrl,
  sanitizeCoolpcSourceCategoryUrl,
  shouldReportInvalidCoolpcProductImageUrl,
} from "./parser/urls";
import { classifyProductVendor } from "./vendor-classification";

export type {
  ContentValidationStatus,
  CoolpcParseIssue,
  CoolpcParseResult,
  ExcludedCoolpcProduct,
  ParsedCoolpcProduct,
  ParseErrorType,
  ProductExclusionReason,
  SourceCategoryContext,
} from "./parser/types";

// 將抓到的來源位元組資料以 Big5 解碼成字串，供 parser pipeline 後續使用。
export function decodeCoolpcHtml(buffer: Buffer | Uint8Array, encoding = "big5"): string {
  return decode(buffer, encoding);
}

// 解析單一 CoolPC 分類頁 HTML，回傳驗證結果、可入庫商品、異常問題與去重統計。
export function parseCoolpcCategoryPage(
  html: string,
  context: SourceCategoryContext,
): CoolpcParseResult {
  const validation = validateCoolpcCategoryPage(html, context);

  if (validation.status !== "valid") {
    return {
      validation,
      items: [],
      excludedProducts: [],
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
  const excludedProducts: ExcludedCoolpcProduct[] = [];
  const issues: CoolpcParseIssue[] = [];
  const seenItemsBySourceKey = new Map<string, ParsedCoolpcProduct>();
  let deduplicatedItemCount = 0;
  let hasFatalIssue = false;

  for (const candidate of candidates) {
    const ibuyToken = candidate.rawToken.trim();
    const name = normalizeProductName(candidate.rawName);
    const matchingName = normalizeBoundedProductName(name);

    if (matchingName === null) {
      issues.push({
        type: "content_validation_failed",
        message: `Product candidate name exceeds ${MAX_PRODUCT_NAME_LENGTH} normalized code units.`,
      });
      continue;
    }

    if (ibuyToken.length === 0) {
      issues.push({
        type: "missing_ibuy_token",
        message: "Product candidate is missing iBuy token.",
        rawName: name,
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

    const exclusionReason = getProductExclusionReason(context.igrp, matchingName);
    if (exclusionReason) {
      excludedProducts.push({ ibuyToken, reason: exclusionReason });
      continue;
    }

    const price = parsePriceText(candidate.rawPriceText);
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

    const primaryImageUrl = normalizeCoolpcProductImageUrl(candidate.rawImageUrl, context.igrp);
    if (
      primaryImageUrl === null &&
      shouldReportInvalidCoolpcProductImageUrl(candidate.rawImageUrl)
    ) {
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
      // 同一分類頁可能重複出現同一列；同 token 同資料可去重忽略，
      // 但同 token 對應不同內容時視為身份衝突，需標記為致命問題。
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

    const vendor = classifyProductVendor(context.igrp, matchingName);
    const filterTags = mergeProductFilterTags(
      context.igrp,
      extractProductFilterTags(context.igrp, matchingName),
      context.sourceFilterTagsByProductName?.[normalizeFilterSyncProductName(name)] ?? [],
    );
    const item: ParsedCoolpcProduct = {
      sourceCategoryId: context.sourceCategoryId,
      igrp: context.igrp,
      sourceName: context.sourceName,
      displayName: context.displayName,
      ibuyToken,
      sourceItemKey: sourceProductKey,
      name,
      normalizedName: name.toLocaleLowerCase("zh-TW"),
      vendorSlug: vendor?.slug ?? null,
      vendorName: vendor?.name ?? null,
      filterTags,
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
    excludedProducts,
    issues,
    deduplicatedItemCount,
    canImport: items.length > 0 && !hasFatalIssue,
  };
}

function getProductExclusionReason(igrp: number, name: string): ProductExclusionReason | null {
  if (/^(?:\[加購優惠\]|【加購優惠】)/.test(name)) {
    return "conditional_add_on";
  }

  const isBundledCpuMotherboard =
    igrp === 4 &&
    /^\[搭CPU[^\]]*\]/i.test(name) &&
    /\b(?:H610|B760|Z790|H810|B860|Z890|A520|B550|B650E?|B840|B850|X670E?|X870E?)M?\b/i.test(name);

  if (isBundledCpuMotherboard) {
    return "misclassified_bundle_product";
  }

  const isBundledPsuCoolingProduct =
    igrp === 15 &&
    name.includes("+") &&
    /(?:水冷|\bAIO\b)/i.test(name) &&
    /現省\s*\$[\d,]+/i.test(name) &&
    /ATX\s*3(?:\.[01])?|(?:金|銀|銅|白金|鈦金)牌|全模(?:組)?|半模(?:組)?|電源供應器|\bPSU\b/i.test(
      name,
    );

  if (isBundledPsuCoolingProduct) {
    return "misclassified_bundle_product";
  }

  if (igrp !== 14 || !hasCaseBundlePrefix(name)) {
    return null;
  }

  if (/\d{3,4}\s*W(?=$|[^A-Z0-9])/i.test(name)) {
    return "misclassified_bundle_product";
  }

  const powerSupplyFeatureCount = [
    /(?:金|銀|銅|白金|鈦金)牌/i,
    /全模(?:組)?|半模(?:組)?/i,
    /ATX\s*3(?:\.[01])?/i,
    /SFX(?:-L|規格)?/i,
    /電源供應器|\bPSU\b/i,
  ].filter((pattern) => pattern.test(name)).length;

  return powerSupplyFeatureCount >= 2 ? "misclassified_bundle_product" : null;
}

function hasCaseBundlePrefix(name: string): boolean {
  const closingBracket = name.startsWith("【") ? "】" : name.startsWith("[") ? "]" : null;
  if (closingBracket === null) {
    return false;
  }

  const closingBracketIndex = name.indexOf(closingBracket, 1);
  if (closingBracketIndex < 0) {
    return false;
  }

  const label = name.slice(1, closingBracketIndex);
  const purchaseIndex = label.indexOf("限搭購");
  return purchaseIndex >= 0 && label.indexOf("機殼", purchaseIndex + "限搭購".length) >= 0;
}
