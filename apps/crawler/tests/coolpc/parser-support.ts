// apps/crawler/tests/coolpc/parser-support.ts
// 提供 CoolPC parser 測試共用的 fixture 讀取、分類 context 與小型 edge case HTML builder。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COOLPC_TARGET_CATEGORIES, type CoolpcTargetCategory } from "../../src/coolpc/categories";
import { createCoolpcCategoryUrl, type SourceCategoryContext } from "../../src/coolpc/parser";

const fixtureDir = join(__dirname, "fixtures");

export const context: SourceCategoryContext = {
  sourceCategoryId: "00000000-0000-0000-0000-000000000004",
  igrp: 4,
  sourceName: "處理器 CPU",
  displayName: "CPU",
  fetchedAt: new Date("2026-05-27T06:00:00.000Z"),
  sourceCategoryUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=4&PHPSESSID=local-session",
};

export function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf8");
}

// 建立只含單筆商品列的 live-like HTML，用來測試特定 raw image URL 邊界。
export function categoryHtml({ igrp, rawImageUrl }: { igrp: number; rawImageUrl: string }): string {
  return `<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <title>原價屋${contextForCategory(igrp).sourceName}總覽</title>
  </head>
  <body>
    <section class="category">
      <div class="item">
        <div class="w">TOKEN-${igrp}</div>
        <span>
          <img alt="" src="${rawImageUrl}">
          <div class="t">Live-like invalid image product ${igrp}</div>
          <div class="x">含稅：NT4,190</div>
        </span>
      </div>
    </section>
  </body>
</html>`;
}

export function contextForCategory(igrp: number): SourceCategoryContext {
  const category: CoolpcTargetCategory | undefined = COOLPC_TARGET_CATEGORIES.find(
    (candidate) => candidate.igrp === igrp,
  );

  if (!category) {
    throw new Error(`Missing test category for IGrp=${igrp}`);
  }

  return {
    sourceCategoryId: `test-coolpc-igrp-${category.igrp}`,
    igrp: category.igrp,
    sourceName: category.sourceName,
    displayName: category.displayName,
    fetchedAt: context.fetchedAt,
    sourceCategoryUrl: createCoolpcCategoryUrl(category.igrp),
    expectedTitleKeywords: category.expectedTitleKeywords
      ? [...category.expectedTitleKeywords]
      : undefined,
  };
}
