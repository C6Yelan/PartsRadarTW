export function parsePriceText(rawPriceText: string): number | null {
  const match = rawPriceText.match(/(?:NT|\$)\s*([0-9][0-9,]*)/i);

  if (!match) {
    return null;
  }

  const price = Number.parseInt(match[1].replaceAll(",", ""), 10);
  return Number.isInteger(price) && price > 0 ? price : null;
}

export function normalizeProductName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase("zh-TW");
}

export function isExplicitNonProductName(name: string): boolean {
  const normalizedName = normalizeForComparison(normalizeProductName(name));

  return normalizedName.startsWith("【提醒】") || normalizedName.startsWith("[加購價]");
}
