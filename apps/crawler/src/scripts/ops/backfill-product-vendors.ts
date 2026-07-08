// apps/crawler/src/scripts/ops/backfill-product-vendors.ts
// 手動回填既有商品的 vendor metadata，使用目前分類與商品名稱重新套用品牌分類規則。
// 此檔是一次性 ops CLI，不是 scheduled crawler 的常態寫入流程。

import type { PrismaClient } from "@partsradar/db";
import { classifyProductVendor } from "../../coolpc/vendor-classification";
import {
  getPositiveNumberArg,
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

interface BackfillProductVendorsOptions {
  workspaceRoot: string;
  dryRun: boolean;
  limit: number | null;
  igrp: number | null;
}

interface ProductCandidate {
  id: string;
  name: string;
  vendorSlug: string | null;
  vendorName: string | null;
  sourceCategory: {
    igrp: number;
    displayName: string;
  };
}

interface BackfillSummary {
  selected: number;
  changed: number;
  unchanged: number;
  matched: number;
  unmatched: number;
}

// 載入工作區 env 與 Prisma client，執行一次 vendor backfill 並確保 DB 連線收尾。
async function main() {
  const options = parseOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;

    const candidates = await readCandidates(client, options);
    const summary = await backfillProductVendors(client, candidates, options);

    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

// 讀取啟用中 CoolPC 分類的商品候選，保留既有 vendor 欄位供差異判斷。
async function readCandidates(
  client: PrismaClient,
  options: BackfillProductVendorsOptions,
): Promise<ProductCandidate[]> {
  return client.product.findMany({
    where: {
      sourceCategory: {
        ...(options.igrp === null ? {} : { igrp: options.igrp }),
        enabled: true,
      },
    },
    select: {
      id: true,
      name: true,
      vendorSlug: true,
      vendorName: true,
      sourceCategory: {
        select: {
          igrp: true,
          displayName: true,
        },
      },
    },
    orderBy: [{ sourceCategory: { igrp: "asc" } }, { id: "asc" }],
    take: options.limit ?? undefined,
  });
}

// 逐筆重新分類 vendor，dry-run 僅列出變更，write 模式才更新商品欄位。
async function backfillProductVendors(
  client: PrismaClient,
  candidates: ProductCandidate[],
  options: BackfillProductVendorsOptions,
): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    selected: candidates.length,
    changed: 0,
    unchanged: 0,
    matched: 0,
    unmatched: 0,
  };

  for (const product of candidates) {
    const vendor = classifyProductVendor(product.sourceCategory.igrp, product.name);
    const nextVendorSlug = vendor?.slug ?? null;
    const nextVendorName = vendor?.name ?? null;

    if (vendor) {
      summary.matched += 1;
    } else {
      summary.unmatched += 1;
    }

    if (product.vendorSlug === nextVendorSlug && product.vendorName === nextVendorName) {
      summary.unchanged += 1;
      continue;
    }

    summary.changed += 1;

    if (options.dryRun) {
      console.log(
        `[dry-run] ${product.id} | ${product.sourceCategory.displayName} | ${
          nextVendorName ?? "unknown"
        } | ${product.name}`,
      );
      continue;
    }

    await client.product.update({
      where: { id: product.id },
      data: {
        vendorSlug: nextVendorSlug,
        vendorName: nextVendorName,
      },
      select: { id: true },
    });
  }

  return summary;
}

// 解析手動 vendor backfill CLI 參數；此工具預設寫入，需由操作者用 --dry-run 切換預覽。
function parseOptions(args: string[]): BackfillProductVendorsOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  return {
    workspaceRoot: resolveWorkspaceRoot(),
    dryRun: args.includes("--dry-run"),
    limit: getPositiveNumberArg(args, "--limit"),
    igrp: getPositiveNumberArg(args, "--igrp"),
  };
}

// 輸出本次 vendor backfill 的分類命中與實際變更摘要。
function printSummary(summary: BackfillSummary, options: BackfillProductVendorsOptions): void {
  console.log("");
  console.log("Product vendor backfill summary:");
  console.log(`- mode: ${options.dryRun ? "dry-run" : "write"}`);
  console.log(`- selected: ${summary.selected}`);
  console.log(`- matched: ${summary.matched}`);
  console.log(`- unmatched: ${summary.unmatched}`);
  console.log(`- changed: ${summary.changed}`);
  console.log(`- unchanged: ${summary.unchanged}`);
}

// 輸出手動 vendor backfill CLI 說明；此腳本偏維運用途，不作為使用者介面文案。
function printHelp(): void {
  console.log(`
Usage: pnpm ops:product-vendors:backfill [options]

Options:
  --dry-run       Print changes without writing to the database.
  --igrp <value>  Limit backfill to one CoolPC category.
  --limit <value> Limit number of products to scan.
  --help          Show this help message.
`);
}

main().catch((error: unknown) => {
  console.error(toSafeCliErrorMessage(error));
  process.exitCode = 1;
});
