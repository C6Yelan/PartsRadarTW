// apps/crawler/src/coolpc/parser/normalization.ts
// 提供 CoolPC 解析 pipeline 內的欄位正規化與判斷函式：價格字串、商品名稱、大小寫比較與非商品列判定。

// 從 raw 價格字串解析整數 TWD，無法解析或非正整數回傳 null。
export function parsePriceText(rawPriceText: string): number | null {
  const match = rawPriceText.match(/(?:NT|\$)\s*([0-9][0-9,]*)/i);

  if (!match) {
    return null;
  }

  const price = Number.parseInt(match[1].replaceAll(",", ""), 10);
  return Number.isInteger(price) && price > 0 ? price : null;
}

// 將商品名稱空白壓縮為單一空白並 trim，提供 parser 後續一致處理。
export function normalizeProductName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

// 將字串去除空白並統一小寫，用於後續名稱比對與關鍵字判斷。
export function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase("zh-TW");
}

// 判斷是否為排除的非商品列（提醒列 / 加購價），供 parse 流程過濾。
export function isExplicitNonProductName(name: string): boolean {
  const normalizedName = normalizeForComparison(normalizeProductName(name));

  return normalizedName.startsWith("【提醒】") || normalizedName.startsWith("[加購價]");
}
