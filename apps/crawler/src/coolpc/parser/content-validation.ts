// apps/crawler/src/coolpc/parser/content-validation.ts
import { load } from "cheerio";
import { extractCoolpcProductCandidates } from "./candidates";
import {
  isExplicitNonProductName,
  normalizeForComparison,
  parsePriceText,
} from "./normalization";
import type { ContentValidationResult, SourceCategoryContext } from "./types";

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

function expectedTitleKeywords(context: SourceCategoryContext): string[] {
  return context.expectedTitleKeywords ?? [context.sourceName, context.displayName];
}
