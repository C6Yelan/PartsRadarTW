// apps/web/app/_shared/formatting.ts
// 統一 web 畫面使用的整數與新台幣格式，並為缺值或無效數字提供明確 fallback。

const INTEGER_FORMATTER = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 0,
});

// 將有限數字顯示為整數；缺值或非有限數字回傳呼叫端指定的 fallback。
export function formatInteger(value: number | null | undefined, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? INTEGER_FORMATTER.format(value)
    : fallback;
}

// 將價格固定顯示為含空格的 NT$ 文字。
export function formatTwdPrice(value: number | null | undefined, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `NT$ ${formatInteger(value)}`
    : fallback;
}

// 將價格差額顯示為帶正負號的 NT$ 文字；零值不加符號。
export function formatSignedTwdPrice(value: number | null | undefined, fallback = "—"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  if (value === 0) {
    return formatTwdPrice(0);
  }

  return `${value > 0 ? "+" : "−"}${formatTwdPrice(Math.abs(value))}`;
}

// 將百分比顯示為帶正負號的文字；負值與價格差額統一使用 Unicode minus sign。
export function formatSignedPercent(
  value: number | null | undefined,
  fractionDigits = 1,
  fallback = "—",
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  if (value === 0) {
    return "0%";
  }

  const roundedAbsoluteValue = Number(Math.abs(value).toFixed(fractionDigits));
  if (roundedAbsoluteValue === 0) {
    return "0%";
  }

  return `${value > 0 ? "+" : "−"}${roundedAbsoluteValue.toFixed(fractionDigits)}%`;
}
