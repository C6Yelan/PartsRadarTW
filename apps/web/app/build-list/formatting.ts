// apps/web/app/build-list/formatting.ts
export function formatBuildListPrice(amount: number) {
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

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
