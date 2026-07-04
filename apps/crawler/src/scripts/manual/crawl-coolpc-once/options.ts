// apps/crawler/src/scripts/manual/crawl-coolpc-once/options.ts

import { DEFAULT_COOLPC_CATEGORY_DELAY_MS } from "../../../coolpc/live-crawl";
import {
  getNumberArg,
  getStringArg,
  resolveRelativeToWorkspace,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_STORAGE_DIR = "temp/coolpc-manual-crawl/snapshots";

export interface CrawlOptions {
  workspaceRoot: string;
  fromRawDir: string | null;
  storageDir: string;
  delayMs: number;
}

export function parseOptions(args: string[]): CrawlOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const fromRawDirArg = getStringArg(args, "--from-raw-dir");
  const fromRawDir = fromRawDirArg
    ? resolveRelativeToWorkspace(workspaceRoot, fromRawDirArg)
    : null;

  if (!fromRawDir && !args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing live CoolPC fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this command contacts the source site and must stay manual-only.`,
    );
  }

  return {
    workspaceRoot,
    fromRawDir,
    storageDir: resolveRelativeToWorkspace(
      workspaceRoot,
      getStringArg(args, "--storage-dir") ??
        process.env.SNAPSHOT_STORAGE_DIR ??
        DEFAULT_STORAGE_DIR,
    ),
    delayMs: getNumberArg(args, "--delay-ms", DEFAULT_COOLPC_CATEGORY_DELAY_MS),
  };
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler manual:crawl-coolpc-once -- --from-raw-dir <path>
  pnpm --filter @partsradar/crawler manual:crawl-coolpc-once -- --confirm-live-fetch [options]

Options:
  --from-raw-dir <path>      Replay saved raw HTML from the workspace root.
                             Expected files: igrp-4.html, igrp-5.html, ...
  --confirm-live-fetch       Required for live CoolPC requests.
  --delay-ms <ms>            Delay between live category requests.
                             Default: ${DEFAULT_COOLPC_CATEGORY_DELAY_MS}
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Default: ${DEFAULT_STORAGE_DIR}
`);
}
