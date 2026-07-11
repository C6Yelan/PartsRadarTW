// apps/web/app/api/price-report/handler.ts
// 處理公開價格報告 query、共用 reader、來源狀態與安全 JSON response。

import {
  readRecentPriceReport,
  type PriceReportReaderClient,
} from "@partsradar/db/price-report";

import { InvalidQueryError } from "../_shared/query";
import {
  internalErrorResponse,
  invalidQueryResponse,
  jsonOk,
} from "../_shared/responses";
import {
  SOURCE_STATUS_CATEGORY_QUERY,
  type SourceStatusReadClient,
} from "../source-status/data";
import { buildSourceStatusResponse } from "../source-status/response";
import {
  getPriceReportSince,
  parsePriceReportQuery,
  toRecentPriceReportFilters,
} from "./query";
import { buildPriceReportResponse, type PriceReportResponseBody } from "./response";

export type PriceReportApiReadClient = PriceReportReaderClient & SourceStatusReadClient;

interface GetPriceReportHandlerOptions {
  now?: () => Date;
}

export function createGetPriceReportHandler(
  client: PriceReportApiReadClient,
  options: GetPriceReportHandlerOptions = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const until = options.now?.() ?? new Date();
      const query = parsePriceReportQuery(new URL(request.url).searchParams);
      const since = getPriceReportSince(until, query.window);
      const [report, sourceCategories] = await Promise.all([
        readRecentPriceReport(client, {
          since,
          until,
          filters: toRecentPriceReportFilters(query),
        }),
        client.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      ]);
      const relevantCategories =
        query.categoryIgrp === null
          ? sourceCategories
          : sourceCategories.filter((category) => category.igrp === query.categoryIgrp);
      const sourceStatus = buildSourceStatusResponse(relevantCategories, until);

      return jsonOk<PriceReportResponseBody>(
        buildPriceReportResponse(report, {
          query,
          since,
          until,
          sourceStatus,
        }),
      );
    } catch (error) {
      if (error instanceof InvalidQueryError) {
        return invalidQueryResponse();
      }

      return internalErrorResponse();
    }
  };
}
