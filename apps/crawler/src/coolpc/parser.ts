// apps/crawler/src/coolpc/parser.ts
// CoolPC parser 入口，負責把分類頁 HTML 轉成 parsed products 與 issues 清單；
// 同時重用 parser helpers 做頁面驗證、候選擷取、欄位正規化與 vendor 分類判斷。

import {
  createCoolpcCategoryUrl,
  extractProductFilterTags,
  mergeProductFilterTags,
} from "@partsradar/shared";
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
  createCoolpcSourceProductKey,
  normalizeCoolpcProductImageUrl,
  sanitizeCoolpcSourceCategoryUrl,
} from "./parser/urls";
import { classifyProductVendor } from "./vendor-classification";
import { normalizeFilterSyncProductName } from "./filter-sync/parser";

export type {
  ContentValidationStatus,
  CoolpcParseIssue,
  CoolpcParseResult,
  ParsedCoolpcProduct,
  ParseErrorType,
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

    if (isMisclassifiedCategoryProduct(context.igrp, name)) {
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

    const vendor = classifyProductVendor(context.igrp, name);
    const filterTags = mergeProductFilterTags(
      context.igrp,
      extractProductFilterTags(context.igrp, name),
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
    issues,
    deduplicatedItemCount,
    canImport: items.length > 0 && !hasFatalIssue,
  };
}

function isMisclassifiedCategoryProduct(igrp: number, name: string): boolean {
  return (
    igrp === 4 &&
    /^\[搭CPU[^\]]*\]/i.test(name) &&
    /\b(?:H610|B760|Z790|H810|B860|Z890|A520|B550|B650E?|B840|B850|X670E?|X870E?)M?\b/i.test(name)
  );
}
