// apps/web/app/api/source-status/handler.ts
// 處理來源狀態 API 的資料讀取、狀態 response 組裝與錯誤回應。

import { internalErrorResponse, jsonOk } from "../_shared/responses";
import { SOURCE_STATUS_CATEGORY_QUERY, type SourceStatusReadClient } from "./data";
import { buildSourceStatusResponse, type SourceStatusResponseBody } from "./response";

// 暫由 handler 作為 source-status 子模組出口，供商品列表 API 共用來源狀態查詢與型別。
export { SOURCE_STATUS_CATEGORY_QUERY } from "./data";
export type { SourceStatusCategoryRecord, SourceStatusReadClient } from "./data";
export { buildSourceStatusResponse } from "./response";
export type { SourceStatus, SourceStatusResponseBody } from "./response";

interface GetSourceStatusHandlerOptions {
  now?: () => Date;
}

// 建立來源狀態 API handler，將 sourceCategory 查詢結果轉成 public status response。
export function createGetSourceStatusHandler(
  client: SourceStatusReadClient,
  options: GetSourceStatusHandlerOptions = {},
): () => Promise<Response> {
  return async () => {
    try {
      const now = options.now?.() ?? new Date();
      const categories = await client.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY);

      return jsonOk<SourceStatusResponseBody>(buildSourceStatusResponse(categories, now));
    } catch {
      return internalErrorResponse();
    }
  };
}
