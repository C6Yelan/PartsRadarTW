// apps/crawler/src/scripts/manual/validate-coolpc-live.ts
// 手動驗證 CoolPC parser 的 CLI，支援 raw 重放與 live 抓取，輸出可重用的驗證報表與摘要資料。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createCoolpcCategoryUrl } from "@partsradar/shared";
import { COOLPC_TARGET_CATEGORIES, type CoolpcTargetCategory } from "../../coolpc/categories";
import { decodeCoolpcHtml, parseCoolpcCategoryPage } from "../../coolpc/parser";
import {
  getNumberArg,
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import {
  countIssues,
  createContext,
  createMarkdownReport,
  type ValidationSummary,
} from "./validate-coolpc-live/report";

// 未加此旗標時不允許 live 抓取，避免誤打到來源站。
const CONFIRM_FLAG = "--confirm-live-fetch";
// 目標分流之間的預設等待毫秒數，保留原有預設值便於手動一致性。
const DEFAULT_DELAY_MS = 5000;

// 手動驗證主流程：解析參數、決定 live/raw 模式、逐分類抓取、寫入 raw，最後輸出摘要報表。
async function main() {
  const args = process.argv.slice(2);
  const fromRawDir = getStringArg(args, "--from-raw-dir");

  // live 抓取採 opt-in；帶 --from-raw-dir 的離線重放不會連線來源站。
  if (!fromRawDir && !args.includes(CONFIRM_FLAG)) {
    throw new Error(
      `Refusing live CoolPC fetch. Re-run with ${CONFIRM_FLAG} because this command contacts the source site and must stay manual-only.`,
    );
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const delayMs = getNumberArg(args, "--delay-ms", DEFAULT_DELAY_MS);
  const outputDirArg =
    getStringArg(args, "--output-dir") ??
    join("temp", "coolpc-live-validation", timestampForPath(new Date()));
  const outputDir = resolveWorkspacePathArgument(workspaceRoot, outputDirArg);
  // 重放資料與輸出目錄都以 workspace root 當基準，避免在不同工作目錄下路徑解讀偏移。
  const inputRawDir = fromRawDir ? resolveWorkspacePathArgument(workspaceRoot, fromRawDir) : null;
  const rawDir = join(outputDir, "raw");
  await mkdir(rawDir, { recursive: true });

  const summaries: ValidationSummary[] = [];

  for (const [index, category] of COOLPC_TARGET_CATEGORIES.entries()) {
    const fetchedAt = new Date();
    const url = createCoolpcCategoryUrl(category.igrp);
    const { html, httpStatus } = inputRawDir
      ? await readRawSnapshot(inputRawDir, category.igrp)
      : await fetchLiveCategory(category, url);
    const context = createContext(category, fetchedAt, url);
    const result = parseCoolpcCategoryPage(html, context);
    const rawPath = join(rawDir, `igrp-${category.igrp}.html`);
    await writeFile(rawPath, html, "utf8");

    summaries.push({
      igrp: category.igrp,
      displayName: category.displayName,
      url,
      fetchedAt: fetchedAt.toISOString(),
      httpStatus,
      validationStatus: result.validation.status,
      validationReason: result.validation.reason ?? null,
      title: result.validation.title,
      tokenCount: result.validation.tokenCount,
      nameCount: result.validation.nameCount,
      priceTextCount: result.validation.priceTextCount,
      parsedItemCount: result.items.length,
      deduplicatedItemCount: result.deduplicatedItemCount,
      issueCounts: countIssues(result.issues),
      canImport: result.canImport,
      firstItems: result.items.slice(0, 3).map((item) => ({
        name: item.name,
        price: item.price,
        sourceItemKey: item.sourceItemKey,
      })),
    });

    if (!inputRawDir && index < COOLPC_TARGET_CATEGORIES.length - 1) {
      await delay(delayMs);
    }
  }

  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summaries, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(outputDir, "report.md"),
    createMarkdownReport(summaries, outputDir, inputRawDir),
    "utf8",
  );

  const validCount = summaries.filter((summary) => summary.validationStatus === "valid").length;
  console.log(`Validated ${validCount}/${summaries.length} categories.`);
  console.log(`Report: ${relative(workspaceRoot, join(outputDir, "report.md"))}`);
}

// 對單一分類執行 live 抓取，保留回應狀態供後續驗證與報表輸出。
async function fetchLiveCategory(category: CoolpcTargetCategory, url: string) {
  console.log(`Fetching IGrp=${category.igrp} ${category.displayName}: ${url}`);

  // User-Agent 包含專案識別字，讓來源站 log 可辨識為手動驗證流量。
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
      "user-agent":
        "PartsRadarTW manual parser validation (+https://github.com/C6Yelan/PartsRadarTW)",
    },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());

  return {
    html: decodeCoolpcHtml(bytes),
    httpStatus: response.status,
  };
}

// 從 raw 快照目錄讀取指定 IGrp 的 HTML；回傳 pseudo-response 狀態以維持與 live 分支一致。
async function readRawSnapshot(rawDir: string, igrp: number) {
  const path = join(rawDir, `igrp-${igrp}.html`);
  console.log(`Reading IGrp=${igrp} from ${path}`);
  const html = await readFile(path, "utf8");

  return {
    html,
    httpStatus: 200,
  };
}

// 將時間戳轉成可排序且不含冒號的目錄名稱，方便每次報表輸出不衝突。
function timestampForPath(date: Date): string {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-");
}

// 分類處理間隔，保留原始 event loop 友善的 Promise 介面。
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(toSafeCliErrorMessage(error));
  process.exitCode = 1;
});
