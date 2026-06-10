// apps/crawler/src/scripts/ops/product-link-checker/options.ts
import {
  getNumberArg,
  getPositiveNumberArg,
  getStringArg,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";
import type { ProductLinkKindValue, ProductLinkHealthStatusValue } from "./processor";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_MIN_DELAY_MS = 10000;
const DEFAULT_MAX_DELAY_MS = 20000;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_STALE_AFTER_HOURS = 48;
const DEFAULT_FAILURE_THRESHOLD = 3;

export interface ProductLinkCheckerOptions {
  workspaceRoot: string;
  dryRun: boolean;
  limit: number | null;
  igrp: number | null;
  staleAfterHours: number;
  minDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  failureThreshold: number;
  kinds: ProductLinkKindValue[];
}

export interface ProductLinkCheckerSummary {
  selected: number;
  checked: number;
  dryRun: number;
  ok: number;
  broken: number;
  temporaryError: number;
  liveRequests: number;
}

export function parseOptions(
  args: string[],
  cwd = process.cwd(),
): ProductLinkCheckerOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const dryRun = args.includes("--dry-run");

  if (!dryRun && !args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing live product link checks. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this command contacts external sites and must stay manual/ops-only.`,
    );
  }

  const minDelayMs = getNumberArg(args, "--min-delay-ms", DEFAULT_MIN_DELAY_MS);
  const maxDelayMs = getNumberArg(args, "--max-delay-ms", DEFAULT_MAX_DELAY_MS);
  const staleAfterHours = getNumberArg(args, "--stale-after-hours", DEFAULT_STALE_AFTER_HOURS);
  const failureThreshold =
    getPositiveNumberArg(args, "--failure-threshold") ?? DEFAULT_FAILURE_THRESHOLD;

  if (minDelayMs > maxDelayMs) {
    throw new Error("--min-delay-ms must be less than or equal to --max-delay-ms.");
  }

  if (staleAfterHours < 1) {
    throw new Error("--stale-after-hours must be at least 1.");
  }

  return {
    workspaceRoot: resolveWorkspaceRoot(cwd),
    dryRun,
    limit: getPositiveNumberArg(args, "--limit"),
    igrp: getPositiveNumberArg(args, "--igrp"),
    staleAfterHours,
    minDelayMs,
    maxDelayMs,
    timeoutMs: getNumberArg(args, "--timeout-ms", DEFAULT_TIMEOUT_MS),
    failureThreshold,
    kinds: parseKinds(getStringArg(args, "--kinds")),
  };
}

export function printSummary(
  summary: ProductLinkCheckerSummary,
  options: ProductLinkCheckerOptions,
): void {
  console.log("");
  console.log("Product link health check finished.");
  console.log(`- Mode: ${options.dryRun ? "dry-run" : "live check"}`);
  console.log(`- Link kinds: ${options.kinds.map(toPublicKindLabel).join(", ")}`);
  console.log(`- Selected: ${summary.selected}`);
  console.log(`- Checked: ${summary.checked}`);
  console.log(`- Dry run: ${summary.dryRun}`);
  console.log(`- OK: ${summary.ok}`);
  console.log(`- Broken: ${summary.broken}`);
  console.log(`- Temporary error: ${summary.temporaryError}`);
  console.log(`- Live requests: ${summary.liveRequests}`);
}

function parseKinds(rawKinds: string | undefined): ProductLinkKindValue[] {
  const rawValues = rawKinds?.split(",").map((value) => value.trim().toLowerCase()) ?? ["source"];
  const kinds: ProductLinkKindValue[] = [];

  for (const rawValue of rawValues) {
    const kind = toProductLinkKind(rawValue);

    if (!kind) {
      throw new Error("--kinds only supports source.");
    }

    if (!kinds.includes(kind)) {
      kinds.push(kind);
    }
  }

  if (kinds.length === 0) {
    throw new Error("--kinds only supports source.");
  }

  return kinds;
}

function toProductLinkKind(rawValue: string): ProductLinkKindValue | null {
  switch (rawValue) {
    case "source":
      return "SOURCE";
    default:
      return null;
  }
}

function toPublicKindLabel(kind: ProductLinkKindValue): string {
  return kind === "SOURCE" ? "source" : kind;
}

export function toSummaryKey(status: ProductLinkHealthStatusValue): "ok" | "broken" | "temporaryError" {
  switch (status) {
    case "OK":
      return "ok";
    case "BROKEN":
      return "broken";
    case "TEMPORARY_ERROR":
      return "temporaryError";
  }
}

function printHelp(): void {
  console.log(`Usage:
  pnpm ops:product-links:check -- --dry-run
  pnpm ops:product-links:check -- --confirm-live-fetch

Options:
  --confirm-live-fetch       Required for live external link requests.
  --dry-run                  Select candidates without source requests or DB writes.
  --limit <count>            Maximum due links to check. Default: all due links.
  --igrp <number>            Limit to one enabled CoolPC category.
  --kinds <list>             Comma-separated link kinds. Only source is supported.
                             Default: source
  --stale-after-hours <hrs>  Recheck links older than this. Default: ${DEFAULT_STALE_AFTER_HOURS}
  --failure-threshold <n>    Consecutive 404/410 failures before marking broken.
                             Default: ${DEFAULT_FAILURE_THRESHOLD}
  --min-delay-ms <ms>        Minimum randomized delay between live requests.
                             Default: ${DEFAULT_MIN_DELAY_MS}
  --max-delay-ms <ms>        Maximum randomized delay between live requests.
                             Default: ${DEFAULT_MAX_DELAY_MS}
  --timeout-ms <ms>          Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --help                     Show this help message.
`);
}
