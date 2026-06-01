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
  rawDiscussionUrl: string;
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
  vendorSlug: string | null;
  vendorName: string | null;
  primaryImageUrl: string;
  discussionUrl: string | null;
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
