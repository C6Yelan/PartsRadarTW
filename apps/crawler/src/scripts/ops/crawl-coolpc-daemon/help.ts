// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/help.ts
// 輸出 scheduled CoolPC crawler daemon 的精簡 CLI 使用說明。

import { DEFAULT_STORAGE_DIR } from "./options";

// 印出 daemon 維運入口的 help 文字；實際參數驗證仍以 options parser 為準。
export function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:crawl-coolpc-daemon -- --confirm-live-fetch [options]

Options:
  --confirm-live-fetch       Required for scheduled CoolPC live requests.
  --run-once                 Run one scheduled cycle, then exit.
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Must equal the active root or its controlled child.
                             SNAPSHOT_STORAGE_DIR replaces the built-in default when set.
                             Default: SNAPSHOT_STORAGE_DIR or ${DEFAULT_STORAGE_DIR}
`);
}
