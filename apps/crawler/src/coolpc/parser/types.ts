// apps/crawler/src/coolpc/parser/types.ts
// 定義 CoolPC parser 在跨模組間傳遞的資料結構：驗證結果、候選欄位、解析結果與問題類型。

// 僅支援台幣價格。
export type Currency = "TWD";

// parser 前驗證的總體結果狀態。
export type ContentValidationStatus = "valid" | "invalid" | "suspected_block";

// 解析失敗時可追蹤的標準 issue 類型，對應 parse issue 與持久化欄位。
export type ParseErrorType =
  | "missing_ibuy_token"
  | "missing_name"
  | "invalid_image_url"
  | "price_parse_failed"
  | "duplicate_source_identity"
  | "content_validation_failed";

// 送入 parser 的分類上下文：頁面來源、名稱與抓取時間，是 parsed item 的身份來源。
export interface SourceCategoryContext {
  sourceCategoryId: string;
  igrp: number;
  sourceName: string;
  displayName: string;
  fetchedAt: Date;
  sourceUrl?: string;
  expectedTitleKeywords?: string[];
}

// parser 抽取出的原始候選欄位，供後續正規化與驗證。
export interface CoolpcProductCandidate {
  rawToken: string;
  rawName: string;
  rawPriceText: string;
  rawImageUrl: string;
}

// 進入資料庫寫入的標準商品資料，保留原始來源欄位與標準化欄位。
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
  primaryImageUrl: string | null;
  price: number;
  currency: Currency;
  sourceUrl: string;
  fetchedAt: Date;
}

// parser 異常事件（不一定阻塞整頁），保留 raw 欄位便於追蹤與檢修。
export interface CoolpcParseIssue {
  type: ParseErrorType;
  message: string;
  rawName?: string;
  rawPriceText?: string;
  rawImageUrl?: string;
  rawToken?: string;
  sourceItemKey?: string;
}

// validator 針對分類頁回傳的結構化結果，含頁面指標與解析可行性。
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

// parse 主函式輸出的完整結果，供後續 writer 與狀態回報使用。
export interface CoolpcParseResult {
  validation: ContentValidationResult;
  items: ParsedCoolpcProduct[];
  issues: CoolpcParseIssue[];
  deduplicatedItemCount: number;
  canImport: boolean;
}
