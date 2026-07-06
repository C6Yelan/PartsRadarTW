// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/help.ts
// 輸出 scheduled CoolPC crawler daemon 的 CLI 使用說明，集中呈現可調整的排程、lock 與圖片補圖選項。

import { DEFAULT_COOLPC_CATEGORY_DELAY_MS } from "../../../coolpc/live-crawl";
import { DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS } from "../external-fetch-lock";
import {
  DEFAULT_BACKOFF_SECONDS,
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_LOCK_RETRY_SECONDS,
  DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS,
  DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES,
  DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
  DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS,
  DEFAULT_PRODUCT_IMAGE_STORAGE_DIR,
  DEFAULT_STORAGE_DIR,
  MAX_CATEGORY_DELAY_MS,
  MAX_LOCK_RETRY_SECONDS,
  MIN_BACKOFF_SECONDS,
  MIN_CATEGORY_DELAY_MS,
  MIN_INTERVAL_SECONDS,
  MIN_LOCK_RETRY_SECONDS,
} from "./options";

// 印出 daemon 維運入口的 help 文字；實際參數驗證仍以 options parser 為準。
export function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:crawl-coolpc-daemon -- --confirm-live-fetch [options]

Options:
  --confirm-live-fetch       Required for scheduled CoolPC live requests.
  --run-once                 Run one scheduled cycle, then exit.
  --interval-seconds <sec>   Delay after a successful cycle.
                             Default: ${DEFAULT_INTERVAL_SECONDS}, minimum: ${MIN_INTERVAL_SECONDS}
  --backoff-seconds <sec>    Delay after fetch/parse/block failures.
                             Default: ${DEFAULT_BACKOFF_SECONDS}, minimum: ${MIN_BACKOFF_SECONDS}
  --lock-retry-seconds <sec> Delay before retrying when another external fetch task holds the lock.
                             Default: ${DEFAULT_LOCK_RETRY_SECONDS}, range: ${MIN_LOCK_RETRY_SECONDS}-${MAX_LOCK_RETRY_SECONDS}
  --category-delay-ms <ms>   Delay between live category requests.
                             Default: ${DEFAULT_COOLPC_CATEGORY_DELAY_MS}, range: ${MIN_CATEGORY_DELAY_MS}-${MAX_CATEGORY_DELAY_MS}
  --new-product-image-min-delay-ms <ms>
                             Minimum delay between new-product image requests.
                             Default: ${DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS}
  --new-product-image-max-delay-ms <ms>
                             Maximum delay between new-product image requests.
                             Default: ${DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS}
  --new-product-image-timeout-ms <ms>
                             Timeout for each new-product source image request.
                             Default: ${DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS}
  --new-product-image-max-source-bytes <bytes>
                             Maximum accepted source image size for new products.
                             Default: ${DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES}
  --product-image-storage-dir <path>
                             Product image cache directory from the workspace root.
                             Default: PRODUCT_IMAGE_STORAGE_DIR, then ${DEFAULT_PRODUCT_IMAGE_STORAGE_DIR}
  --lock-dir <path>          Shared external fetch lock directory.
  --lock-stale-seconds <sec> Break stale external fetch locks after this age.
  --priority-signal-ttl-seconds <sec>
                             Higher-priority external fetch signal TTL.
                             Default: ${DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS}
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Default: ${DEFAULT_STORAGE_DIR}

Environment:
  CRAWLER_INTERVAL_SECONDS, CRAWLER_BACKOFF_SECONDS, CRAWLER_LOCK_RETRY_SECONDS,
  CRAWLER_CATEGORY_DELAY_MS,
  CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS, CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS,
  CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS, CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES,
  SNAPSHOT_STORAGE_DIR, EXTERNAL_FETCH_LOCK_DIR, EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
  PRODUCT_IMAGE_STORAGE_DIR, COOLPC_BASE_URL
`);
}
