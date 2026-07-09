// apps/web/app/products/[id]/detail/format.ts
// 提供商品詳細頁顯示目前價格與資料更新時間的格式化 helper。

// 將商品詳細頁目前價格格式化為台幣顯示文字。
export function formatProductPrice(amount: number) {
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

// 將商品詳細頁的 API 時間字串轉成使用者可讀的日期時間。
export function formatProductDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
