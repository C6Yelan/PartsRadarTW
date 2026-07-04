// apps/web/app/api/source-status/handler.ts
import { internalErrorResponse, jsonOk } from "../_shared/responses";
import { SOURCE_STATUS_CATEGORY_QUERY, type SourceStatusReadClient } from "./data";
import { buildSourceStatusResponse, type SourceStatusResponseBody } from "./response";

export { SOURCE_STATUS_CATEGORY_QUERY } from "./data";
export type { SourceStatusCategoryRecord, SourceStatusReadClient } from "./data";
export { buildSourceStatusResponse } from "./response";
export type { SourceStatus, SourceStatusResponseBody } from "./response";

interface GetSourceStatusHandlerOptions {
  now?: () => Date;
}

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
