// apps/crawler/src/scripts/ops/product-link-health-report/options.ts

import { getStringArg, resolveWorkspaceRoot } from "../../shared/script-utils";
import {
  PRODUCT_LINK_KINDS,
  type ProductLinkKindValue,
} from "../product-link-checker/processor";

export interface ProductLinkHealthReportOptions {
  workspaceRoot: string;
  includeInactive: boolean;
  kinds: ProductLinkKindValue[];
}

export function parseProductLinkHealthReportOptions(
  args: string[],
  cwd = process.cwd(),
): ProductLinkHealthReportOptions {
  if (args.includes("--help")) {
    printProductLinkHealthReportHelp();
    process.exit(0);
  }

  return {
    workspaceRoot: resolveWorkspaceRoot(cwd),
    includeInactive: args.includes("--include-inactive"),
    kinds: parseKinds(getStringArg(args, "--kinds")),
  };
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
      return PRODUCT_LINK_KINDS.SOURCE;
    default:
      return null;
  }
}

export function printProductLinkHealthReportHelp(): void {
  console.log(`Usage:
  pnpm ops:product-links:report [options]

Options:
  --kinds <list>       Comma-separated link kinds. Only source is supported.
                       Default: source
  --include-inactive   Include inactive products. Default: active products only.
  --help               Show this help message.
`);
}
