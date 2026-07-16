// 收斂跨 package 共用的價格報告關鍵字格式與 OR 分組 tokenization。

export function canonicalizePriceReportKeyword(value: string): string {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((group) => group.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
}

export function tokenizePriceReportKeywordGroups(value: string | null | undefined): string[][] {
  const keyword = typeof value === "string" ? canonicalizePriceReportKeyword(value) : "";

  if (!keyword) {
    return [];
  }

  return keyword.split(",").map((group) => group.trim().split(" "));
}
