import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { COOLPC_TARGET_CATEGORIES, type CoolpcTargetCategory } from "../coolpc/categories";
import {
  createCoolpcCategoryUrl,
  decodeCoolpcHtml,
  parseCoolpcCategoryPage,
  type CoolpcParseIssue,
  type ParsedCoolpcProduct,
  type SourceCategoryContext,
} from "../coolpc/parser";

interface ValidationSummary {
  igrp: number;
  displayName: string;
  sourceName: string;
  url: string;
  fetchedAt: string;
  httpStatus: number;
  byteLength: number;
  validationStatus: string;
  validationReason: string | null;
  title: string;
  tokenCount: number;
  nameCount: number;
  priceTextCount: number;
  validCandidateCount: number;
  parsedItemCount: number;
  deduplicatedItemCount: number;
  issueCounts: Record<string, number>;
  canImport: boolean;
  firstItems: Array<Pick<ParsedCoolpcProduct, "ibuyToken" | "name" | "price" | "sourceItemKey">>;
}

const CONFIRM_FLAG = "--confirm-live-fetch";
const DEFAULT_DELAY_MS = 5000;

async function main() {
  const args = process.argv.slice(2);
  const fromRawDir = getStringArg(args, "--from-raw-dir");

  if (!fromRawDir && !args.includes(CONFIRM_FLAG)) {
    throw new Error(
      `Refusing live CoolPC fetch. Re-run with ${CONFIRM_FLAG} because this command contacts the source site and must stay manual-only.`,
    );
  }

  const workspaceRoot = resolve(process.cwd(), "..", "..");
  const delayMs = getNumberArg(args, "--delay-ms", DEFAULT_DELAY_MS);
  const outputDirArg =
    getStringArg(args, "--output-dir") ??
    join("temp", "coolpc-live-validation", timestampForPath(new Date()));
  const outputDir = resolveRelativeToWorkspace(workspaceRoot, outputDirArg);
  const inputRawDir = fromRawDir ? resolveRelativeToWorkspace(workspaceRoot, fromRawDir) : null;
  const rawDir = join(outputDir, "raw");
  const fixtureDir = join(outputDir, "fixtures");
  await mkdir(rawDir, { recursive: true });
  await mkdir(fixtureDir, { recursive: true });

  const summaries: ValidationSummary[] = [];

  for (const [index, category] of COOLPC_TARGET_CATEGORIES.entries()) {
    const fetchedAt = new Date();
    const url = createCoolpcCategoryUrl(category.igrp);
    const { html, httpStatus, byteLength } = inputRawDir
      ? await readRawSnapshot(inputRawDir, category.igrp)
      : await fetchLiveCategory(category, url);
    const context = createContext(category, fetchedAt, url);
    const result = parseCoolpcCategoryPage(html, context);
    const rawPath = join(rawDir, `igrp-${category.igrp}.html`);
    await writeFile(rawPath, html, "utf8");

    if (result.items.length > 0) {
      await writeFile(
        join(fixtureDir, `igrp-${category.igrp}.sample.html`),
        createSampleFixture(category, fetchedAt, result.items.slice(0, 3)),
        "utf8",
      );
    }

    summaries.push({
      igrp: category.igrp,
      displayName: category.displayName,
      sourceName: category.sourceName,
      url,
      fetchedAt: fetchedAt.toISOString(),
      httpStatus,
      byteLength,
      validationStatus: result.validation.status,
      validationReason: result.validation.reason ?? null,
      title: result.validation.title,
      tokenCount: result.validation.tokenCount,
      nameCount: result.validation.nameCount,
      priceTextCount: result.validation.priceTextCount,
      validCandidateCount: result.validation.validCandidateCount,
      parsedItemCount: result.items.length,
      deduplicatedItemCount: result.deduplicatedItemCount,
      issueCounts: countIssues(result.issues),
      canImport: result.canImport,
      firstItems: result.items.slice(0, 3).map((item) => ({
        ibuyToken: item.ibuyToken,
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

function createContext(
  category: CoolpcTargetCategory,
  fetchedAt: Date,
  sourceUrl: string,
): SourceCategoryContext {
  return {
    sourceCategoryId: `manual-coolpc-igrp-${category.igrp}`,
    igrp: category.igrp,
    sourceName: category.sourceName,
    displayName: category.displayName,
    fetchedAt,
    sourceUrl,
    expectedTitleKeywords: category.expectedTitleKeywords
      ? [...category.expectedTitleKeywords]
      : undefined,
  };
}

function createSampleFixture(
  category: CoolpcTargetCategory,
  fetchedAt: Date,
  items: ParsedCoolpcProduct[],
): string {
  const rows = items
    .map(
      (item) => `      <div class="item">
        <div class="w">${escapeHtml(item.ibuyToken)}</div>
        <span>
          <div class="t">${escapeHtml(item.name)}</div>
          <div class="x">含稅：NT${formatPrice(item.price)}</div>
        </span>
      </div>`,
    )
    .join("\n");

  return `<!--
Fixture: sampled live CoolPC ${category.displayName} category structure.
Source type: eachview.php?IGrp=${category.igrp} category page.
Fixture date: ${fetchedAt.toISOString().slice(0, 10)}.
This fixture is reduced from a manual live validation run and keeps only parser-relevant structure.
-->
<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <title>原價屋${escapeHtml(category.sourceName)}總覽</title>
  </head>
  <body>
    <section class="category">
${rows}
    </section>
  </body>
</html>
`;
}

function createMarkdownReport(
  summaries: ValidationSummary[],
  outputDir: string,
  inputRawDir: string | null,
): string {
  const rows = summaries
    .map(
      (summary) =>
        `| ${summary.displayName} | ${summary.igrp} | ${summary.httpStatus} | ${summary.validationStatus} | ${summary.validationReason ?? ""} | ${summary.tokenCount} | ${summary.nameCount} | ${summary.priceTextCount} | ${summary.parsedItemCount} | ${summary.deduplicatedItemCount} | ${summary.canImport ? "yes" : "no"} |`,
    )
    .join("\n");
  const issueSections = summaries
    .map((summary) => {
      const issues =
        Object.entries(summary.issueCounts)
          .map(([type, count]) => `  - ${type}: ${count}`)
          .join("\n") || "  - none";
      const firstItems =
        summary.firstItems
          .map(
            (item) =>
              `  - ${item.sourceItemKey} | ${item.price} | ${sanitizeMarkdownCell(item.name)}`,
          )
          .join("\n") || "  - none";

      return `### ${summary.displayName} (IGrp=${summary.igrp})

- Title: ${summary.title}
- URL: ${summary.url}
- Fetched at: ${summary.fetchedAt}
- Issues:
${issues}
- First parsed items:
${firstItems}
`;
    })
    .join("\n");

  const runModeLines = inputRawDir
    ? `- Input raw directory: \`${inputRawDir}\`
- This run replays saved raw HTML and does not perform live requests.`
    : "- This run performs live requests and is not part of regular automated tests.";

  return `# CoolPC Parser Validation

This report was generated by the manual-only crawler validation command.

- Output directory: \`${outputDir}\`
${runModeLines}
- Full raw HTML was written under the output directory, which is ignored by git.

| Category | IGrp | HTTP | Validation | Reason | div.w | div.t | div.x | Parsed | Deduped | Import |
| --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows}

${issueSections}
`;
}

function countIssues(issues: CoolpcParseIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.type] = (counts[issue.type] ?? 0) + 1;
    return counts;
  }, {});
}

async function fetchLiveCategory(category: CoolpcTargetCategory, url: string) {
  console.log(`Fetching IGrp=${category.igrp} ${category.displayName}: ${url}`);

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
    byteLength: bytes.byteLength,
  };
}

async function readRawSnapshot(rawDir: string, igrp: number) {
  const path = join(rawDir, `igrp-${igrp}.html`);
  console.log(`Reading IGrp=${igrp} from ${path}`);
  const html = await readFile(path, "utf8");

  return {
    html,
    httpStatus: 200,
    byteLength: Buffer.byteLength(html, "utf8"),
  };
}

function getStringArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function getNumberArg(args: string[], name: string, fallback: number): number {
  const raw = getStringArg(args, name);

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function timestampForPath(date: Date): string {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-");
}

function resolveRelativeToWorkspace(workspaceRoot: string, path: string): string {
  return resolve(workspaceRoot, path);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US").format(price);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sanitizeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
