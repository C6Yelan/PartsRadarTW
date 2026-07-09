// apps/web/app/product-explorer/formatting.ts
// 提供商品探索頁專用的價格、百分比、整數與資料更新時間顯示格式。

// 將商品價格格式化為商品探索頁列表使用的 NT$ 顯示文字。
export function formatPrice(amount: number) {
  return `NT$ ${formatInteger(amount)}`;
}

// 將價格變動格式化為帶正負號的台幣文字，供列表價格變動欄使用。
export function formatSignedPrice(amount: number) {
  if (amount === 0) {
    return "NT$ 0";
  }

  return `${amount > 0 ? "+" : "-"}NT$ ${formatInteger(Math.abs(amount))}`;
}

// 將價格變動百分比格式化為帶正負號的一位小數百分比。
export function formatSignedPercent(percent: number) {
  if (percent === 0) {
    return "0%";
  }

  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

// 使用台灣數字格式顯示整數，供價格與商品數量共用。
export function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

// 將 API 回傳時間轉為使用者介面顯示格式；缺值時回傳呼叫端提供的 fallback。
export function formatDateTime(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
