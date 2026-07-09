// apps/web/app/build-list/formatting.ts
// 集中配單頁面與 Excel 匯出使用的價格與時間顯示格式。

// 將配單金額格式化成台幣顯示，供畫面與無障礙文字共用。
export function formatBuildListPrice(amount: number) {
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

// 將配單畫面上的價格時間固定顯示為台灣時間。
export function formatBuildListDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

// 將 Excel 匯出的時間固定轉成 UTC+8 文字；無效值保留原文方便使用者判讀。
export function formatBuildListExportDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const utcPlusEightDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);

  return `${utcPlusEightDate.getUTCFullYear()}-${pad2(
    utcPlusEightDate.getUTCMonth() + 1,
  )}-${pad2(utcPlusEightDate.getUTCDate())} ${pad2(utcPlusEightDate.getUTCHours())}:${pad2(
    utcPlusEightDate.getUTCMinutes(),
  )}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
