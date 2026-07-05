// apps/crawler/src/coolpc/parser/candidates.ts
// 從 CoolPC 清單頁 DOM 抽取商品候選欄位（token、名稱、價格、圖片），回傳 parser pipeline 可處理的 raw 資料。

import type { CheerioAPI } from "cheerio";
import type { CoolpcProductCandidate } from "./types";

// 解析 CoolPC 的候選清單 token，建立 parser pipeline 後續欄位正規化前的暫存資料。
export function extractCoolpcProductCandidates($: CheerioAPI): CoolpcProductCandidate[] {
  return $("div.w")
    .toArray()
    .map((element) => {
      const $token = $(element);
      // 產品清單的名稱、價格與圖片通常貼近 token，但不同頁面包裝層級不同，因此僅在該 token 附近做局部尋找。
      const $nextSpan = $token.nextAll("span").first();
      const $parent = $token.parent();
      const $following = $token.nextAll().slice(0, 4);
      const rawToken = $token.text().trim();
      const rawName = firstText($nextSpan, "div.t") || firstText($parent, "div.t");
      const rawPriceText = firstText($nextSpan, "div.x") || firstText($parent, "div.x");
      const rawImageUrl = firstAttr($nextSpan, "img", "src") || firstAttr($parent, "img", "src");

      return {
        rawToken,
        rawName: rawName || firstText($following, "div.t"),
        rawPriceText: rawPriceText || firstText($following, "div.x"),
        rawImageUrl: rawImageUrl || firstAttr($following, "img", "src"),
      };
    });
}

// 擷取指定範圍第一個匹配 selector 的文字，找不到時回傳空字串。
function firstText(scope: ReturnType<CheerioAPI>, selector: string): string {
  return scope.find(selector).first().text().trim();
}

// 擷取指定範圍第一個匹配 selector 的 attr，找不到時回傳空字串。
function firstAttr(scope: ReturnType<CheerioAPI>, selector: string, attributeName: string): string {
  return scope.find(selector).first().attr(attributeName)?.trim() ?? "";
}
