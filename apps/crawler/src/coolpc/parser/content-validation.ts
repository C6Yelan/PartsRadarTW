// apps/crawler/src/coolpc/parser/content-validation.ts
// 驗證 CoolPC 分類頁 HTML 是否可進 parser，並回傳可進入後續流程的 validity 狀態與基本統計。

import { load } from "cheerio";
import { extractCoolpcProductCandidates } from "./candidates";
import {
  isExplicitNonProductName,
  normalizeForComparison,
  parsePriceText,
} from "./normalization";
import type { ContentValidationResult, SourceCategoryContext } from "./types";

// 驗證分類頁是否符合 expected title / token / 名稱 / 價格的最小條件，並區分正常、無效與疑似封鎖頁。
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

  // HTTP 200 不代表成功。若同時缺少預期標題與商品欄位，優先判為可疑封鎖頁，避免誤將風險頁誤判為空分類。
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

// 取出驗證用關鍵字（有自訂就用自訂，否則退回 sourceName + displayName）。
function expectedTitleKeywords(context: SourceCategoryContext): string[] {
  return context.expectedTitleKeywords ?? [context.sourceName, context.displayName];
}
