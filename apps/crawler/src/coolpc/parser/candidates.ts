// apps/crawler/src/coolpc/parser/candidates.ts
import type { CheerioAPI } from "cheerio";
import type { CoolpcProductCandidate } from "./types";

export function extractCoolpcProductCandidates($: CheerioAPI): CoolpcProductCandidate[] {
  return $("div.w")
    .toArray()
    .map((element) => {
      const $token = $(element);
      // Live pages place product name/price near the token, but the immediate
      // wrapper differs between fixtures and full pages. Keep this traversal local.
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

function firstText(scope: ReturnType<CheerioAPI>, selector: string): string {
  return scope.find(selector).first().text().trim();
}

function firstAttr(scope: ReturnType<CheerioAPI>, selector: string, attributeName: string): string {
  return scope.find(selector).first().attr(attributeName)?.trim() ?? "";
}
