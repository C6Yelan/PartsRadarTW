// apps/crawler/src/scripts/ops/production-smoke/options/help.ts
// 輸出 production smoke CLI 的精簡說明，保留常用 public / DB-backed smoke 調整入口。

import {
  DEFAULT_BASE_URL,
  DEFAULT_FILTER_EMPTY_WARN_MIN_COUNT,
  DEFAULT_FILTER_EMPTY_WARN_RATIO,
  DEFAULT_PRODUCT_IMAGE_STORAGE_DIR,
  DEFAULT_SOURCE_IMAGE_FAILURE_FAIL_COUNT,
  DEFAULT_SOURCE_IMAGE_FAILURE_MIN_CONSECUTIVE,
  DEFAULT_SOURCE_IMAGE_FAILURE_WARN_COUNT,
  DEFAULT_TIMEOUT_MS,
} from "../constants";

// 顯示手動執行 production smoke 時最常用的 options；完整 env 說明仍以 runbook / .env.example 為主。
export function printProductionSmokeHelp(): void {
  console.log(`Usage:
  Production crawler image:
    node --import tsx src/scripts/ops/production-smoke.ts [options]

  Workspace:
  pnpm --filter @partsradar/crawler ops:production-smoke -- [options]

Options:
  --base-url <url>                         Website base URL to check.
                                           Default: SMOKE_PUBLIC_BASE_URL, then ${DEFAULT_BASE_URL}
  --public-only                            Check public HTTP routes/APIs only; does not require DB access.
  --filter-sync-state-file <path>          Check the optional CoolPC filter sync state file.
  --timeout-ms <ms>                        HTTP request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --product-image-storage-dir <path>       Product image cache directory.
                                           Default: PRODUCT_IMAGE_STORAGE_DIR, then ${DEFAULT_PRODUCT_IMAGE_STORAGE_DIR}
  --image-inactive-retention-days <days>   Historical product image retention used by metadata checks.
                                           Default: IMAGE_CACHE_INACTIVE_RETENTION_DAYS, then 30
  --source-warn-after-minutes <minutes>    Warn when source success is older than this.
  --source-fail-after-minutes <minutes>    Fail when source success is older than this.
  --crawler-warn-after-minutes <minutes>   Warn when latest successful crawler run is older than this.
  --crawler-fail-after-minutes <minutes>   Fail when latest successful crawler run is older than this.
  --recent-window-hours <hours>            Window for suspected block and parse error checks.
  --source-image-failure-min-consecutive <count>
                                           Ignore products below this consecutive failure count.
                                           Default: ${DEFAULT_SOURCE_IMAGE_FAILURE_MIN_CONSECUTIVE}
  --source-image-failure-warn-count <count>
                                           Warn at this many affected products. Default: ${DEFAULT_SOURCE_IMAGE_FAILURE_WARN_COUNT}
  --source-image-failure-fail-count <count>
                                           Fail at this many affected products. Default: ${DEFAULT_SOURCE_IMAGE_FAILURE_FAIL_COUNT}
  --filter-empty-warn-min-count <count>    Warn when unclassified products reach this count and ratio.
                                           Default: SMOKE_FILTER_EMPTY_WARN_MIN_COUNT, then ${DEFAULT_FILTER_EMPTY_WARN_MIN_COUNT}
  --filter-empty-warn-ratio <ratio>        Required unclassified ratio for WARN (0-1).
                                           Default: SMOKE_FILTER_EMPTY_WARN_RATIO, then ${DEFAULT_FILTER_EMPTY_WARN_RATIO}
  --help                                   Show this help message.
`);
}
