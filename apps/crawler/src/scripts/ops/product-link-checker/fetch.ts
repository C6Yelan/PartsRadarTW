// apps/crawler/src/scripts/ops/product-link-checker/fetch.ts
// 執行 product link health checker 的單筆來源連結 HTTP 檢查。
// 此檔屬於 link health maintenance 功能線；後續整線移除時一併刪除或收斂。

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { ProductLinkCheckerOptions } from "./options";
import type { LinkCheckOutcome } from "./types";

export async function fetchProductLink(
  url: string,
  options: ProductLinkCheckerOptions,
): Promise<LinkCheckOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
        "user-agent":
          "PartsRadarTW product link health check (+https://github.com/C6Yelan/PartsRadarTW)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        status: "ok",
        httpStatus: response.status,
        errorMessage: null,
      };
    }

    const status = response.status === 404 || response.status === 410 ? "broken" : "temporary_error";

    return {
      status,
      httpStatus: response.status,
      errorMessage: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "temporary_error",
      httpStatus: null,
      errorMessage: toSafeCliErrorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
