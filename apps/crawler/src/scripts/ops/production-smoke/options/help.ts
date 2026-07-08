// apps/crawler/src/scripts/ops/production-smoke/options/help.ts
// 輸出 production smoke CLI 的精簡說明，保留常用 public / DB-backed smoke 調整入口。

import {
  DEFAULT_BASE_URL,
  DEFAULT_INVALID_IMAGE_URL_WARN_COUNT,
  DEFAULT_PRODUCT_IMAGE_STORAGE_DIR,
  DEFAULT_TEMPORARY_LINK_WARN_COUNT,
  DEFAULT_TIMEOUT_MS,
} from "../constants";

// 顯示手動執行 production smoke 時最常用的 options；完整 env 說明仍以 runbook / .env.example 為主。
export function printProductionSmokeHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:production-smoke -- [options]

Options:
  --base-url <url>                         Website base URL to check.
                                           Default: SMOKE_PUBLIC_BASE_URL, then ${DEFAULT_BASE_URL}
  --public-only                            Check public HTTP routes/APIs only; does not require DB access.
  --timeout-ms <ms>                        HTTP request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --product-image-storage-dir <path>       Product image cache directory.
                                           Default: PRODUCT_IMAGE_STORAGE_DIR, then ${DEFAULT_PRODUCT_IMAGE_STORAGE_DIR}
  --source-warn-after-minutes <minutes>    Warn when source success is older than this.
  --source-fail-after-minutes <minutes>    Fail when source success is older than this.
  --crawler-warn-after-minutes <minutes>   Warn when latest successful crawler run is older than this.
  --crawler-fail-after-minutes <minutes>   Fail when latest successful crawler run is older than this.
  --recent-window-hours <hours>            Window for suspected block and parse error checks.
  --invalid-image-url-warn-count <count>   Warn only when source image URL anomalies exceed this.
                                           Default: ${DEFAULT_INVALID_IMAGE_URL_WARN_COUNT}
  --source-temporary-link-warn-count <n>   Warn when source.url temporary link errors exceed this.
                                           Default: ${DEFAULT_TEMPORARY_LINK_WARN_COUNT}
  --help                                   Show this help message.
`);
}
